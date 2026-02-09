import type { Logger } from "pino";
import { AuthServiceApi, Tokens } from "../api/authService";
import { ENV } from "../config/env";
import { waitForOtpFromAuthService, promptOtpOnce } from "./otpProvider";
import { setStoredTokens, clearTokensForUser } from "./tokenStore";
import { maskPassword, maskOtp, maskToken } from "../utils/logMask";

export type Account = { username: string; password: string };

export type LoginFlowResult = {
  ok: boolean;
  reason?: string;
  tokens?: Tokens;
  usedOtp?: string;
};

async function doVerify(
  api: AuthServiceApi,
  username: string,
  otp: string,
  deviceId: string,
  logger?: Logger
): Promise<{ ok: boolean; tokens?: Tokens; msg?: string }> {
  try {
    logger?.debug({ username, otp: maskOtp(otp) }, "VERIFY_OTP_REQUEST");
    const res = await api.verifyLoginOtp(username, otp, deviceId);
    const body = res.data;
    logger?.debug({ username, status: res.status, body }, "VERIFY_OTP_RESPONSE");

    if (body?.isSucceed && body?.data?.tokens) {
      return { ok: true, tokens: body.data.tokens as Tokens };
    }
    return { ok: false, msg: String(body?.message ?? "VERIFY_FAIL") };
  } catch (err: any) {
    logger?.debug({ username, err: err?.message ?? String(err) }, "VERIFY_OTP_ERROR");
    return { ok: false, msg: "VERIFY_ERR" };
  }
}

async function startLoginAttempt(
  api: AuthServiceApi,
  username: string,
  password: string,
  deviceId: string,
  logger?: Logger
): Promise<{ needOtp: boolean; tokens?: Tokens; msg?: string; otpSample?: string }> {
  try {
    logger?.debug({ username }, "LOGIN_REQUEST");
    const res = await api.login(username, password, deviceId);
    const body = res.data;
    logger?.debug({ username, status: res.status, body }, "LOGIN_RESPONSE");

    if (!body?.isSucceed) {
      return { needOtp: true, msg: String(body?.message ?? "LOGIN_FAIL") };
    }

    const data = body.data as any;
    if (data?.needOtp === false && data?.tokens) {
      return { needOtp: false, tokens: data.tokens as Tokens };
    }

    return { needOtp: true, msg: "NEED_OTP", otpSample: data?.otpSample };
  } catch (err: any) {
    logger?.debug({ username, err: err?.message ?? String(err) }, "LOGIN_ERROR");
    return { needOtp: true, msg: "LOGIN_ERR" };
  }
}
export async function loginWithOtpFlow(
  api: AuthServiceApi,
  acc: Account,
  deviceId: string,
  logger?: Logger
): Promise<LoginFlowResult> {
  const username = String(acc.username || "").replace(/\D/g, "");
  const password = String(acc.password || "");

  logger?.debug(
    {
      username,
      password: maskPassword(password),
      deviceId,
      autoFetchOtp: ENV.AUTO_FETCH_OTP,
      autoResend: ENV.AUTO_RESEND,
      promptOtp: ENV.PROMPT_OTP,
      verifyWindowMs: ENV.VERIFY_WINDOW_MS,
      resendWindowMs: ENV.RESEND_WINDOW_MS,
      maxResend: ENV.MAX_RESEND,
      otpDebugPath: ENV.OTP_DEBUG_PATH_REDIS,
    },
    "LOGIN_START"
  );
  clearTokensForUser(username);

  while (true) {
    const loginAttempt = await startLoginAttempt(api, username, password, deviceId, logger);

    if (!loginAttempt.needOtp && loginAttempt.tokens) {
      setStoredTokens(username, loginAttempt.tokens.accessToken, loginAttempt.tokens.refreshToken, deviceId);
      logger?.debug(
        {
          username,
          accessToken: maskToken(loginAttempt.tokens.accessToken),
          refreshToken: maskToken(loginAttempt.tokens.refreshToken),
        },
        "LOGIN_OK_NO_OTP"
      );
      return { ok: true, tokens: loginAttempt.tokens };
    }
    if (loginAttempt.msg && loginAttempt.msg !== "NEED_OTP") {
      logger?.debug({ username, msg: loginAttempt.msg }, "LOGIN_FAIL");
      return { ok: false, reason: loginAttempt.msg };
    }
    let resendCount = 0;
    let sessionStartMs = Date.now();

    logger?.debug({ username }, "OTP_SESSION_START");

    while (true) {
      const verifyDeadline = sessionStartMs + ENV.VERIFY_WINDOW_MS;
      let lastOtp: string | null = null;


      let redisStaleOtp: string | null = null;
      try {
        if (ENV.OTP_DEBUG_PATH_REDIS) {
          const rd = await api.debugRedisOtp(username, "LOGIN");
          const payload = rd.data?.data;
          if (payload) {
            const direct = payload.otp ?? payload.smsOtp ?? payload.otpKeyOtp ?? null;
            const msgOtp = payload.msg?.otp ?? payload.smsLatest?.otp ?? null;
            const ro = String(direct || msgOtp || "").trim();
            if (ro.length >= 4) redisStaleOtp = ro;
          }
        }
      } catch (e) { }

      let directOtp = redisStaleOtp || (loginAttempt as any).otpSample || null;
      if (redisStaleOtp) {
        logger?.debug({ username, otp: maskOtp(redisStaleOtp) }, "REDIS_STALE_OTP_FOUND");
      } else if (directOtp) {
        logger?.debug({ username, directOtp: maskOtp(directOtp) }, "OTP_SAMPLE_RECEIVED");
      }

      while (Date.now() < verifyDeadline) {
        let otp: string | null = directOtp;
        directOtp = null;

        if (!otp && ENV.AUTO_FETCH_OTP) {
          otp = await waitForOtpFromAuthService(api, username, {
            context: "LOGIN",
            sinceMs: sessionStartMs,
            timeoutMs: Math.min(ENV.OTP_TIMEOUT_MS, Math.max(500, verifyDeadline - Date.now())),
            pollMs: ENV.OTP_POLL_MS,
            logger,
          });
        } else if (ENV.PROMPT_OTP) {
          otp = await promptOtpOnce(`Nhập OTP cho ${username}: `, logger);
        }

        if (!otp) {
          await new Promise((r) => setTimeout(r, ENV.OTP_POLL_MS));
          continue;
        }

        if (otp === lastOtp) {
          await new Promise((r) => setTimeout(r, ENV.OTP_POLL_MS));
          continue;
        }
        lastOtp = otp;

        for (let k = 0; k < ENV.OTP_VERIFY_RETRY; k++) {
          const vr = await doVerify(api, username, otp, deviceId, logger);
          if (vr.ok && vr.tokens) {
            setStoredTokens(username, vr.tokens.accessToken, vr.tokens.refreshToken, deviceId);
            logger?.debug(
              {
                username,
                accessToken: maskToken(vr.tokens.accessToken),
                refreshToken: maskToken(vr.tokens.refreshToken),
              },
              "LOGIN_OK_WITH_OTP"
            );
            return { ok: true, tokens: vr.tokens, usedOtp: otp };
          }
          logger?.debug({ username, attempt: k + 1, msg: vr.msg, otp: maskOtp(otp) }, "VERIFY_NOT_OK");
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      const resendDeadline = verifyDeadline + ENV.RESEND_WINDOW_MS;

      if (resendCount >= ENV.MAX_RESEND) {
        logger?.debug({ username, resendCount }, "OTP_MAX_RESEND_REACHED_BACK_TO_LOGIN");
        break;
      }

      if (!ENV.AUTO_RESEND) {
        while (Date.now() < resendDeadline) {
          await new Promise((r) => setTimeout(r, 500));
        }
        logger?.debug({ username }, "OTP_RESEND_WINDOW_EXPIRED_BACK_TO_LOGIN");
        break;
      }
      try {
        logger?.debug({ username, resendCount: resendCount + 1 }, "RESEND_OTP_REQUEST");
        const rr = await api.resendLoginOtp(username, deviceId);
        const body = rr.data;

        if (body?.data?.otpSample) {
          directOtp = body.data.otpSample;
          logger?.debug({ username, directOtp: maskOtp(directOtp) }, "RESEND_OTP_SAMPLE_RECEIVED");
        }

        if (!body?.isSucceed) {
          const msg = String(body?.message ?? "RESEND_FAIL");
          logger?.debug({ username, msg }, "RESEND_NOT_ALLOWED_BACK_TO_LOGIN");
          break;
        }

        resendCount += 1;
        sessionStartMs = Date.now();
        logger?.debug({ username, resendCount }, "RESEND_OK_SESSION_RESTART");
        continue;
      } catch (err: any) {
        logger?.error({ username, err: err?.message ?? String(err) }, "RESEND_OTP_ERROR_BACK_TO_LOGIN");
        break;
      }
    }
    logger?.debug({ username }, "BACK_TO_LOGIN");
  }
}
