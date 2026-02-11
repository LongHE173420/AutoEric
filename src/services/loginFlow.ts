import type { Logger } from "pino";
import { AuthServiceApi, Tokens } from "../api/authService";
import { ENV } from "../config/env";
import { waitForOtpFromAuthService, promptOtpOnce } from "../utils/otp";
import { setStoredTokens, clearTokensForUser, getStoredTokens } from "../storage/tokenStore";
import { getMeWithAutoAuth } from "./protectedApi";
import { maskToken } from "../utils/logMask";
import { isAccessExpired, isRefreshExpired } from "../utils/tokenUtils";
import { clearAllData } from "../storage/tokenStore";
import { buildHeaders } from "../utils/headers";

export type Account = { phone: string; password: string };

export type LoginFlowResult = {
  ok: boolean;
  reason?: string;
  tokens?: Tokens;
  usedOtp?: string;
};
export type EnsureLoginResult = {
  ok: boolean;
  tokens?: Tokens;
  reason?: string;
  method: "ALREADY_VALID" | "REFRESHED" | "LOGIN_PASS" | "LOGIN_OTP" | "FAIL";
  usedOtp?: string;
};
export async function ensureLogin(
  api: AuthServiceApi,
  acc: Account,
  activeDeviceId: string,
  headers: any,
  logger?: Logger
): Promise<EnsureLoginResult> {
  const phone = String(acc.phone || "").replace(/\D/g, "");
  const stored = getStoredTokens(phone);
  if (stored) {
    const me = await getMeWithAutoAuth(api, phone, activeDeviceId, logger);
    if (me.ok) {

      const final = getStoredTokens(phone);
      logger?.debug({ me: me.data }, "SESSION_OK_SKIP_LOGIN");
      return {
        ok: true,
        tokens: final || undefined,
        method: "ALREADY_VALID"
      };
    }
    logger?.debug({ reason: me.message }, "SESSION_NOT_OK_WILL_LOGIN");
  }
  const res = await loginWithOtpFlow(api, acc, headers, logger);
  if (res.ok && res.tokens) {
    return {
      ok: true,
      tokens: res.tokens,
      method: res.usedOtp ? "LOGIN_OTP" : "LOGIN_PASS",
      usedOtp: res.usedOtp
    };
  }

  return { ok: false, reason: res.reason, method: "FAIL" };
}

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
export type EnsureTokenResult = {
  ok: boolean;
  accessToken?: string;
  reason?: string;
  refreshed?: boolean;
};

export async function ensureValidAccessToken(
  api: AuthServiceApi,
  phone: string,
  deviceId: string,
  logger?: Logger
): Promise<EnsureTokenResult> {
  try {
    const stored = getStoredTokens(phone);
    if (!stored) {
      return { ok: false, reason: "NO_TOKENS" };
    }

    const { accessToken, refreshToken } = stored;

    const accessExpired = isAccessExpired(accessToken);
    const refreshExpired = isRefreshExpired(refreshToken);

    logger?.debug(
      {
        phone,
        accessExpired,
        refreshExpired,
        accessToken: maskToken(accessToken),
        refreshToken: maskToken(refreshToken),
      },
      "TOKEN_STATUS"
    );

    if (!accessExpired) {
      return { ok: true, accessToken, reason: "ACCESS_OK" };
    }

    if (refreshExpired) {
      logger?.debug({ phone }, "REFRESH_EXPIRED_CLEAR_ALL");
      clearAllData();
      return { ok: false, reason: "REFRESH_EXPIRED" };
    }

    logger?.debug({ phone }, "REFRESH_TRY");
    const headers = buildHeaders(deviceId);
    const res = await api.refreshToken(refreshToken, headers);
    const body = res.data;
    const bodyData = body?.data;

    let newTokens: Tokens | undefined;
    if (body?.isSucceed) {
      if (bodyData?.tokens) {
        newTokens = bodyData.tokens as Tokens;
      } else if (bodyData?.accessToken && bodyData?.refreshToken) {
        newTokens = {
          accessToken: bodyData.accessToken,
          refreshToken: bodyData.refreshToken
        };
      }
    }

    if (newTokens) {
      setStoredTokens(phone, newTokens.accessToken, newTokens.refreshToken, deviceId);
      logger?.info(
        {
          phone,
          accessToken: maskToken(newTokens.accessToken),
          refreshToken: maskToken(newTokens.refreshToken),
        },
        "REFRESH_OK"
      );
      return { ok: true, accessToken: newTokens.accessToken, refreshed: true, reason: "REFRESH_OK" };
    }

    const msg = String(body?.message ?? "REFRESH_FAIL");
    logger?.debug({ phone, msg }, "REFRESH_FAIL_LOGOUT");
    clearTokensForUser(phone);
    return { ok: false, reason: msg };

  } catch (err: any) {
    logger?.error({ phone, err: err?.message ?? String(err) }, "REFRESH_ERR_LOGOUT");
    clearTokensForUser(phone);
    return { ok: false, reason: "REFRESH_ERROR" };
  }
}
