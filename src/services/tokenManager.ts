import type { Logger } from "pino";
import { AuthServiceApi, Tokens } from "../api/authService";
import { getStoredTokens, setStoredTokens, clearAllData, clearTokensForUser } from "../storage/tokenStore";
import { isAccessExpired, isRefreshExpired } from "../utils/tokenUtils";
import { maskToken } from "../utils/logMask";
import { buildHeaders } from "../utils/headers";

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

    if (body?.isSucceed && body?.data?.tokens) {
      const t = body.data.tokens as Tokens;
      setStoredTokens(phone, t.accessToken, t.refreshToken, deviceId);
      logger?.info(
        {
          phone,
          accessToken: maskToken(t.accessToken),
          refreshToken: maskToken(t.refreshToken),
        },
        "REFRESH_OK"
      );
      return { ok: true, accessToken: t.accessToken, refreshed: true, reason: "REFRESH_OK" };
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
