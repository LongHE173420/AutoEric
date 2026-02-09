import type { Logger } from "pino";
import { AuthServiceApi } from "../api/authService";
import { ensureValidAccessToken } from "./tokenManager";
import { clearTokensForUser } from "../storage/tokenStore";

export async function getMeWithAutoAuth(
  api: AuthServiceApi,
  phone: string,
  deviceId: string,
  logger?: Logger
): Promise<{ ok: boolean; data?: any; message?: string }> {
  try {
    const t = await ensureValidAccessToken(api, phone, deviceId, logger);
    if (!t.ok || !t.accessToken) {
      return { ok: false, message: t.reason ?? "NO_TOKEN" };
    }

    const res = await api.getMe(t.accessToken);
    const body = res.data;
    logger?.debug({ phone, status: res.status, body }, "ME_RESPONSE");

    if (body?.isSucceed) {
      return { ok: true, data: body.data };
    }

    const msg = String(body?.message ?? "ME_FAIL");

    if (msg === "ACCESS_TOKEN_EXPIRED") {
      const t2 = await ensureValidAccessToken(api, phone, deviceId, logger);
      if (t2.ok && t2.accessToken) {
        const res2 = await api.getMe(t2.accessToken);
        const body2 = res2.data;
        logger?.debug({ phone, status: res2.status, body: body2 }, "ME_RETRY_RESPONSE");
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
    logger?.error({ phone, err: err?.message ?? String(err) }, "ME_ERROR");
    return { ok: false, message: "ME_ERROR" };
  }
}
