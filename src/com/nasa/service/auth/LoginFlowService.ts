
import { AuthServiceApi, Tokens } from "../../api/auth/authApiService";
import { ENV } from "../../config/env";
import { setStoredTokens, clearTokensForUser, getStoredTokens, clearAllData } from "../../storage/tokenStore";
import { maskToken, maskOtp, Log } from "../../utils/log";
import { isAccessExpired, isRefreshExpired } from "../../utils/tokenUtils";
import { buildHeaders } from "../../utils/headers";
import { UserApiService } from "../../api/user/userApiService";
type AppLogger = ReturnType<typeof Log.getLogger>;
export type Account = { phone: string; password: string; deviceId?: string; proxy?: string; userAgent?: string; };

export type LoginFlowResult = {
  ok: boolean;
  reason?: string;
  tokens?: Tokens;
  usedOtp?: string;
};


type WaitOtpOptions = {
  timeoutMs?: number;
  pollMs?: number;
  sinceMs?: number;
  context?: string;
  logger?: AppLogger;
  headers?: any;
};

function parseOtp(data: any): { otp: string | null; tsMs: number | null } {
  if (!data) return { otp: null, tsMs: null };
  // Try different paths for OTP
  const direct = data.otp ?? data.smsOtp ?? data.otpKeyOtp;
  const msgOtp = data.msg?.otp ?? data.smsLatest?.otp;
  const otp = String(direct ?? msgOtp ?? "").trim();

  // Try different paths for Timestamp
  const tsRaw = data.msg?.timestamp ?? data.msg?.received_at ?? data.timestamp;
  let tsMs: number | null = null;
  if (tsRaw) {
    const n = Number(tsRaw);
    tsMs = Number.isFinite(n) ? n : Date.parse(String(tsRaw)) || null;
  }

  return { otp: otp.length >= 4 ? otp : null, tsMs };
}

async function waitForOtp(
  api: AuthServiceApi,
  phone: string,
  opts: WaitOtpOptions = {}
): Promise<string | null> {
  const {
    timeoutMs = ENV.OTP_TIMEOUT_MS,
    pollMs = ENV.OTP_POLL_MS,
    sinceMs = 0,
    context = "LOGIN",
    logger,
    headers
  } = opts;

  const t0 = Date.now();
  let lastOtp: string | null = null;

  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await api.debugRedisOtp(phone, context, headers);
      const { otp, tsMs } = parseOtp(res.data?.data);
      const fresh = !sinceMs || (tsMs == null || tsMs >= sinceMs);

      if (otp && fresh) {
        if (otp !== lastOtp) {
          logger?.debug("OTP_FOUND", { phone, otp: maskOtp(otp), tsMs });
        }
        return otp;
      }
    } catch (err: any) {

    }

    lastOtp = null;
    await new Promise((r) => setTimeout(r, pollMs));
  }

  logger?.debug("OTP_TIMEOUT", { phone, timeoutMs });
  return null;
}

export async function loginWithOtpFlow(
  api: AuthServiceApi,
  acc: Account,
  headers: any,
  logger?: AppLogger
): Promise<LoginFlowResult> {
  const phone = String(acc.phone || "").trim();
  const password = String(acc.password || "");

  clearTokensForUser(phone);

  const loginRes = await api.login(phone, password, headers);
  const loginData = loginRes.data?.data as any;

  if (!loginRes.data?.isSucceed) {
    const msg = String(loginRes.data?.message ?? "LOGIN_FAIL");
    if (msg !== "NEED_OTP" && !loginData?.otpRequired) {
      logger?.warn("LOGIN_FAIL", { msg });
      return { ok: false, reason: msg };
    }
  }
  if (loginData?.tokens || (loginData?.accessToken && loginData?.refreshToken)) {
    const tokens = (loginData.tokens || { accessToken: loginData.accessToken, refreshToken: loginData.refreshToken }) as Tokens;
    const sDevice = headers["X-Device-Id"] || headers["x-device-id"];
    const sUa = headers["User-Agent"] || headers["user-agent"];
    setStoredTokens(phone, tokens.accessToken, tokens.refreshToken, sDevice, sUa);
    logger?.debug("LOGIN_PASS_SUCCESS", {});
    return { ok: true, tokens };
  }

  let sessionStartMs = Date.now();
  let failCount = 0;

  while (failCount < 2) {
    const deadline = sessionStartMs + ENV.VERIFY_WINDOW_MS;

    let otp: string | null = null;
    if (ENV.AUTO_FETCH_OTP) {

      const timeout = Math.min(ENV.OTP_TIMEOUT_MS, Math.max(500, deadline - Date.now()));
      otp = await waitForOtp(api, phone, { sinceMs: sessionStartMs, timeoutMs: timeout, logger, headers });

      if (!otp) {
        logger?.debug("OTP_MISSING_FAST_FAIL", { phone });
        return { ok: false, reason: "OTP_TIMEOUT" };
      }
    }

    if (!otp) return { ok: false, reason: "OTP_MISSING" };

    for (let i = 0; i < ENV.OTP_VERIFY_RETRY; i++) {
      const vr = await api.verifyLoginOtp(phone, otp, headers);
      if (vr.data?.isSucceed && vr.data?.data) {
        const d = vr.data.data;
        const tokens = (d.tokens || { accessToken: d.accessToken, refreshToken: d.refreshToken }) as Tokens;
        if (tokens?.accessToken) {
          const sDevice = headers["X-Device-Id"] || headers["x-device-id"];
          const sUa = headers["User-Agent"] || headers["user-agent"];
          setStoredTokens(phone, tokens.accessToken, tokens.refreshToken, sDevice, sUa);
          logger?.debug("LOGIN_OTP_SUCCESS", {});
          return { ok: true, tokens, usedOtp: otp };
        }
      }
      await new Promise(r => setTimeout(r, 300));
    }

    logger?.warn("OTP_VERIFY_FAIL_RETRYING", { phone });
    if (!ENV.AUTO_RESEND || failCount >= ENV.MAX_RESEND) break;

    await api.resendLoginOtp(phone, headers);
    sessionStartMs = Date.now();
    failCount++;
  }

  return { ok: false, reason: "LOGIN_FAILED_FINAL" };
}


export async function ensureValidAccessToken(
  api: AuthServiceApi,
  phone: string,
  deviceId: string,
  currentTokens: ReturnType<typeof getStoredTokens>,
  logger?: AppLogger
): Promise<{ ok: boolean; accessToken?: string; refreshed?: boolean; reason?: string }> {

  if (!currentTokens) return { ok: false, reason: "NO_TOKENS" };

  const { accessToken, refreshToken } = currentTokens;

  if (!isAccessExpired(accessToken)) {
    return { ok: true, accessToken, reason: "ACCESS_OK" };
  }

  if (isRefreshExpired(refreshToken)) {
    clearAllData();
    return { ok: false, reason: "REFRESH_EXPIRED" };
  }

  try {
    logger?.debug("REFRESHING", { phone });
    const res = await api.refreshToken(refreshToken, buildHeaders(deviceId, currentTokens.userAgent));
    const d = res.data?.data;
    const newTokens = (d?.tokens || (d?.accessToken ? { accessToken: d.accessToken, refreshToken: d.refreshToken } : null)) as Tokens;

    if (newTokens) {
      setStoredTokens(phone, newTokens.accessToken, newTokens.refreshToken, deviceId, currentTokens.userAgent);
      logger?.info("REFRESH_SUCCESS", {});
      return { ok: true, accessToken: newTokens.accessToken, refreshed: true };
    }
  } catch (e) { }

  clearTokensForUser(phone);
  return { ok: false, reason: "REFRESH_FAIL" };
}

export async function getMeWithAutoAuth(
  api: AuthServiceApi,
  phone: string,
  deviceId: string,
  logger?: AppLogger,
  agent?: any
): Promise<{ ok: boolean; data?: any; message?: string }> {

  const stored = getStoredTokens(phone);
  const valid = await ensureValidAccessToken(api, phone, deviceId, stored, logger);

  if (!valid.ok || !valid.accessToken) return { ok: false, message: valid.reason };

  try {
    const headers = buildHeaders(deviceId);
    const res = await UserApiService.getProfileMe(valid.accessToken, headers, agent);
    const d = res.data;
    // Support both {isSucceed: true, data: {...}} and direct {id, userName, ...} responses
    if (d?.isSucceed && d?.data) return { ok: true, data: d.data };
    if (d?.data?.id || d?.data?.userName) return { ok: true, data: d.data };
    if (d?.id || d?.userName) return { ok: true, data: d };
    logger?.info("GET_ME_FAILED_BODY", { phone, message: d?.message, data: d?.data });
  } catch (e: any) {
    const errorData = e.response?.data;
    logger?.info("GET_ME_ERROR_DETAIL", {
      phone,
      error: e.message,
      status: e.response?.status,
      data: errorData
    });
  }

  return { ok: false, message: "ME_FAIL" };
}
