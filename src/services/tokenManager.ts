import type { Logger } from "pino";
import { AuthServiceApi, Tokens } from "../api/authService";
import { getStoredTokens, setStoredTokens, clearAllData, clearTokensForUser } from "./tokenStore";
import { isAccessExpired, isRefreshExpired } from "../utils/tokenUtils";
import { maskToken } from "../utils/logMask";

export type EnsureTokenResult = {
  ok: boolean;
  accessToken?: string;
  reason?: string;
  refreshed?: boolean;
};

export async function ensureValidAccessToken(
  api: AuthServiceApi,
  username: string,
  deviceId: string,
  logger?: Logger
): Promise<EnsureTokenResult> {
  const stored = getStoredTokens(username);
  if (!stored) {
    return { ok: false, reason: "NO_TOKENS" };
  }

  const { accessToken, refreshToken } = stored;

  const accessExpired = isAccessExpired(accessToken);
  const refreshExpired = isRefreshExpired(refreshToken);

  logger?.debug(
    {
      username,
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

    logger?.debug({ username }, "REFRESH_EXPIRED_CLEAR_ALL");
    clearAllData();
    return { ok: false, reason: "REFRESH_EXPIRED" };
  }


  try {
    logger?.debug({ username }, "REFRESH_TRY");
    const res = await api.refreshToken(refreshToken);
    const body = res.data;

    if (body?.isSucceed && body?.data?.tokens) {
      const t = body.data.tokens as Tokens;
      setStoredTokens(username, t.accessToken, t.refreshToken, deviceId);
      logger?.info(
        {
          username,
          accessToken: maskToken(t.accessToken),
          refreshToken: maskToken(t.refreshToken),
        },
        "REFRESH_OK"
      );
      return { ok: true, accessToken: t.accessToken, refreshed: true, reason: "REFRESH_OK" };
    }

    const msg = String(body?.message ?? "REFRESH_FAIL");
    logger?.debug({ username, msg }, "REFRESH_FAIL_LOGOUT");
    clearTokensForUser(username);
    return { ok: false, reason: msg };
  } catch (err: any) {
    logger?.error({ username, err: err?.message ?? String(err) }, "REFRESH_ERR_LOGOUT");
    clearTokensForUser(username);
    return { ok: false, reason: "REFRESH_ERROR" };
  }
}
