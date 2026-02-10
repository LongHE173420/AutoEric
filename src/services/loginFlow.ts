import type { Logger } from "pino";
import { AuthServiceApi, Tokens } from "../api/authService";
import { ENV } from "../config/env";
import { waitForOtpFromAuthService, promptOtpOnce } from "../utils/otp";
import { setStoredTokens, clearTokensForUser } from "../storage/tokenStore";
import { maskPassword, maskOtp, maskToken } from "../utils/logMask";

export type Account = { phone: string; password: string };

export type LoginFlowResult = {
  ok: boolean;
  reason?: string;
  tokens?: Tokens;
  usedOtp?: string;
};

async function doVerify(
  api: AuthServiceApi,
  phone: string,
  otp: string,
  headers: any,
  logger?: Logger
): Promise<{ ok: boolean; tokens?: Tokens; msg?: string }> {

  const res = await api.verifyLoginOtp(phone, otp, headers);
  const body = res.data;

  if (body?.isSucceed) {
    if (body.data?.tokens) {
      return { ok: true, tokens: body.data.tokens as Tokens };
    }
    if (body.data?.accessToken && body.data?.refreshToken) {
      return {
        ok: true,
        tokens: {
          accessToken: body.data.accessToken,
          refreshToken: body.data.refreshToken,
        },
      };
    }
  }
  return { ok: false, msg: String(body?.message ?? "VERIFY_FAIL") };
}

async function startLoginAttempt(
  api: AuthServiceApi,
  phone: string,
  password: string,
  headers: any,
  logger?: Logger
): Promise<{ needOtp: boolean; tokens?: Tokens; msg?: string; otpSample?: string }> {

  const res = await api.login(phone, password, headers);
  const body = res.data;

  if (!body?.isSucceed) {
    return { needOtp: true, msg: String(body?.message ?? "LOGIN_FAIL") };
  }

  const data = body.data as any;
  if (data?.needOtp === false || data?.otpRequired === false) {
    if (data?.tokens) {
      return { needOtp: false, tokens: data.tokens as Tokens };
    }
    if (data?.accessToken && data?.refreshToken) {
      return {
        needOtp: false,
        tokens: {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        },
      };
    }
  }

  return { needOtp: true, msg: "NEED_OTP", otpSample: data?.otpSample };
}

export async function loginWithOtpFlow(
  api: AuthServiceApi,
  acc: Account,
  headers: any,
  logger?: Logger
): Promise<LoginFlowResult> {
  const phone = String(acc.phone || "").replace(/\D/g, "");
  const password = String(acc.password || "");

  clearTokensForUser(phone);
  while (true) {
    try {
      const loginAttempt = await startLoginAttempt(api, phone, password, headers, logger);

      if (!loginAttempt.needOtp && loginAttempt.tokens) {
        setStoredTokens(phone, loginAttempt.tokens.accessToken, loginAttempt.tokens.refreshToken, headers["x-device-id"]);

        logger?.debug({}, "LOGIN_OK_NO_OTP");
        return { ok: true, tokens: loginAttempt.tokens };
      }

      if (loginAttempt.msg && loginAttempt.msg !== "NEED_OTP") {
        logger?.warn({ msg: loginAttempt.msg }, "LOGIN_FAIL");
        return { ok: false, reason: loginAttempt.msg };
      }

      let resendCount = 0;
      let sessionStartMs = Date.now();

      while (true) {
        const verifyDeadline = sessionStartMs + ENV.VERIFY_WINDOW_MS;
        let lastOtp: string | null = null;
        let redisStaleOtp: string | null = null;

        if (ENV.OTP_DEBUG_PATH_REDIS) {
          const rd = await api.debugRedisOtp(phone, "LOGIN");
          const payload = rd.data?.data;
          if (payload) {
            const direct = payload.otp ?? payload.smsOtp ?? payload.otpKeyOtp ?? null;
            const msgOtp = payload.msg?.otp ?? payload.smsLatest?.otp ?? null;
            const ro = String(direct || msgOtp || "").trim();
            if (ro.length >= 4) redisStaleOtp = ro;
          }
        }

        let directOtp = redisStaleOtp || (loginAttempt as any).otpSample || null;

        while (Date.now() < verifyDeadline) {
          let otp: string | null = directOtp;
          directOtp = null;

          if (!otp && ENV.AUTO_FETCH_OTP) {
            otp = await waitForOtpFromAuthService(api, phone, {
              context: "LOGIN",
              sinceMs: sessionStartMs,
              timeoutMs: Math.min(ENV.OTP_TIMEOUT_MS, Math.max(500, verifyDeadline - Date.now())),
              pollMs: ENV.OTP_POLL_MS,
              logger,
              headers
            });
          } else if (ENV.PROMPT_OTP) {
            otp = await promptOtpOnce(`Nhập OTP cho ${phone}: `, logger);
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
            const vr = await doVerify(api, phone, otp, headers, logger);
            if (vr.ok && vr.tokens) {
              setStoredTokens(phone, vr.tokens.accessToken, vr.tokens.refreshToken, headers["X-Device-Id"]);
              logger?.debug({}, "LOGIN_OK_WITH_OTP");
              return { ok: true, tokens: vr.tokens, usedOtp: otp };
            }
            await new Promise((r) => setTimeout(r, 300));
          }
        }

        const resendDeadline = verifyDeadline + ENV.RESEND_WINDOW_MS;
        if (resendCount >= ENV.MAX_RESEND) break;

        if (!ENV.AUTO_RESEND) {
          while (Date.now() < resendDeadline) await new Promise((r) => setTimeout(r, 500));
          break;
        }

        // Resend
        logger?.debug({ phone, resendCount: resendCount + 1 }, "RESEND_OTP_REQUEST");
        const rr = await api.resendLoginOtp(phone, headers);
        const body = rr.data;
        if (body?.data?.otpSample) directOtp = body.data.otpSample;

        if (!body?.isSucceed) {
          break;
        }

        resendCount += 1;
        sessionStartMs = Date.now();
        continue;
      }

      logger?.debug({}, "BACK_TO_LOGIN");

    } catch (err: any) {

      logger?.error({ err: err?.message ?? String(err) }, "LOGIN_FLOW_EXCEPTION");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
