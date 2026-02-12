import { AuthServiceApi, Tokens } from "../vn.com.nasa.connection.api/authService";
import { ENV } from "../vn.com.nasa.config/env";
import { waitForOtpFromAuthService, promptOtpOnce } from "../vn.com.nasa.utils/otp";
import { setStoredTokens, clearTokensForUser, getStoredTokens } from "../vn.com.nasa.storage/tokenStore";
import { maskToken, Log } from "../vn.com.nasa.utils/log";
import { isAccessExpired, isRefreshExpired } from "../vn.com.nasa.utils/tokenUtils";
import { clearAllData } from "../vn.com.nasa.storage/tokenStore";
import { buildHeaders } from "../vn.com.nasa.utils/headers";


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

type AppLogger = ReturnType<typeof Log.getLogger>;

export async function ensureLogin(
  api: AuthServiceApi,
  acc: Account,
  activeDeviceId: string,
  headers: any,
  logger?: AppLogger
): Promise<EnsureLoginResult> {
  const phone = String(acc.phone || "").replace(/\D/g, "");
  const stored = getStoredTokens(phone);
  if (stored) {
    const me = await getMeWithAutoAuth(api, phone, activeDeviceId, logger);
    if (me.ok) {

      const final = getStoredTokens(phone);
      logger?.debug("SESSION_OK_SKIP_LOGIN", { me: me.data });
      return {
        ok: true,
        tokens: final || undefined,
        method: "ALREADY_VALID"
      };
    }
    logger?.debug("SESSION_NOT_OK_WILL_LOGIN", { reason: me.message });
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
  logger?: AppLogger
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
  logger?: AppLogger
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
  logger?: AppLogger
): Promise<LoginFlowResult> {
  const phone = String(acc.phone || "").replace(/\D/g, "");
  const password = String(acc.password || "");

  clearTokensForUser(phone);
  while (true) {
    try {
      const loginAttempt = await startLoginAttempt(api, phone, password, headers, logger);

      if (!loginAttempt.needOtp && loginAttempt.tokens) {
        setStoredTokens(phone, loginAttempt.tokens.accessToken, loginAttempt.tokens.refreshToken, headers["x-device-id"]);

        logger?.debug("LOGIN_OK_NO_OTP", {});
        return { ok: true, tokens: loginAttempt.tokens };
      }

      if (loginAttempt.msg && loginAttempt.msg !== "NEED_OTP") {
        logger?.warn("LOGIN_FAIL", { msg: loginAttempt.msg });
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
              logger: logger as any,
              headers
            });
            if (!otp) {
              logger?.debug("OTP_FETCH_TIMEOUT_FAST_FAIL_ABORT", { phone });
              return { ok: false, reason: "OTP_TIMEOUT" };
            }
          } else if (ENV.PROMPT_OTP) {
            otp = await promptOtpOnce(`Nhập OTP cho ${phone}: `, logger as any);
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
              logger?.debug("LOGIN_OK_WITH_OTP", {});
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
        logger?.debug("RESEND_OTP_REQUEST", { phone, resendCount: resendCount + 1 });
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

      logger?.debug("BACK_TO_LOGIN", {});

    } catch (err: any) {

      logger?.error("LOGIN_FLOW_EXCEPTION", { err: err?.message ?? String(err) });
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
  logger?: AppLogger
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
      "TOKEN_STATUS",
      {
        phone,
        accessExpired,
        refreshExpired,
        accessToken: maskToken(accessToken),
        refreshToken: maskToken(refreshToken),
      }
    );

    if (!accessExpired) {
      return { ok: true, accessToken, reason: "ACCESS_OK" };
    }

    if (refreshExpired) {
      logger?.debug("REFRESH_EXPIRED_CLEAR_ALL", { phone });
      clearAllData();
      return { ok: false, reason: "REFRESH_EXPIRED" };
    }

    logger?.debug("REFRESH_TRY", { phone });
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
        "REFRESH_OK",
        {
          phone,
          accessToken: maskToken(newTokens.accessToken),
          refreshToken: maskToken(newTokens.refreshToken),
        }
      );
      return { ok: true, accessToken: newTokens.accessToken, refreshed: true, reason: "REFRESH_OK" };
    }

    const msg = String(body?.message ?? "REFRESH_FAIL");
    logger?.debug("REFRESH_FAIL_LOGOUT", { phone, msg });
    clearTokensForUser(phone);
    return { ok: false, reason: msg };

  } catch (err: any) {
    logger?.error("REFRESH_ERR_LOGOUT", { phone, err: err?.message ?? String(err) });
    clearTokensForUser(phone);
    return { ok: false, reason: "REFRESH_ERROR" };
  }
}

export async function getMeWithAutoAuth(
  api: AuthServiceApi,
  phone: string,
  deviceId: string,
  logger?: AppLogger
): Promise<{ ok: boolean; data?: any; message?: string }> {
  try {
    const t = await ensureValidAccessToken(api, phone, deviceId, logger);
    if (!t.ok || !t.accessToken) {
      return { ok: false, message: t.reason ?? "NO_TOKEN" };
    }

    const res = await api.getMe(t.accessToken);
    const body = res.data;
    logger?.debug("ME_RESPONSE", { phone, status: res.status, body });

    if (body?.isSucceed) {
      return { ok: true, data: body.data };
    }

    const msg = String(body?.message ?? "ME_FAIL");

    if (msg === "ACCESS_TOKEN_EXPIRED") {
      const t2 = await ensureValidAccessToken(api, phone, deviceId, logger);
      if (t2.ok && t2.accessToken) {
        const res2 = await api.getMe(t2.accessToken);
        const body2 = res2.data;
        logger?.debug("ME_RETRY_RESPONSE", { phone, status: res2.status, body: body2 });
        if (body2?.isSucceed) return { ok: true, data: body2.data };
        return { ok: false, message: String(body2?.message ?? "ME_FAIL") };
      }
      return { ok: false, message: t2.reason ?? "REFRESH_FAIL" };
    }

    if (msg === "INVALID_ACCESS_TOKEN") {
      clearTokensForUser(phone);
    }

    return { ok: false, message: msg };
  } catch (err: any) {
    logger?.error("ME_ERROR", { phone, err: err?.message ?? String(err) });
    return { ok: false, message: "ME_ERROR" };
  }
}