import type { Logger } from "pino";
import { AuthServiceApi } from "../api/authService";
import { AccountRepository } from "../repo/AccountRepository";
import { maskPassword, maskToken } from "../utils/logMask";
import { getDeviceId } from "../utils/device";
import { buildHeaders } from "../utils/headers";
import { getStoredTokens, setStoredTokens } from "../storage/tokenStore";
import { getMeWithAutoAuth } from "./protectedApi";
import { loginWithOtpFlow } from "./loginFlow";

export type JobCtx = { logger: Logger };

export type LoginSummary = {
  success: number;
  alreadyOk: number;
  relogin: number;
  fail: number;
  accounts: number;
};

export async function loginFromDb(api: AuthServiceApi, ctx: JobCtx): Promise<LoginSummary> {
  const logger = ctx.logger;

  const summary: LoginSummary = {
    success: 0,
    alreadyOk: 0,
    relogin: 0,
    fail: 0,
    accounts: 0,
  };

  try {
    const deviceId = getDeviceId();
    const repo = new AccountRepository();
    const accounts = await repo.findEnabledAccounts(1000);

    summary.accounts = accounts.length;
    logger.debug({ accounts: accounts.length, deviceId }, "DB_ACCOUNTS_LOADED");

    const BATCH_SIZE = 5;
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const batch = accounts.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (acc, idx) => {
          try {
            const rowNo = i + idx + 1;
            const phone = String(acc.phone || "").replace(/\D/g, "");
            const password = String(acc.password || "");
            const activeDeviceId = acc.deviceId || deviceId;

            const l = logger.child({ row: rowNo, accId: acc.id, phone });
            l.debug({ password: maskPassword(password) }, "ACCOUNT_START");

            if (!phone || !password) {
              summary.fail += 1;
              await repo.markAttempt(acc.id, "INVALID", "missing phone/password");
              l.warn({}, "ACCOUNT_INVALID_SKIP");
              return;
            }
            if (acc.accessToken && acc.refreshToken) {
              setStoredTokens(phone, acc.accessToken, acc.refreshToken, activeDeviceId);
            }
            const stored = getStoredTokens(phone);
            if (stored) {
              l.debug(
                {
                  accessToken: maskToken(stored.accessToken),
                  refreshToken: maskToken(stored.refreshToken),
                },
                "TOKENS_FOUND"
              );

              const me = await getMeWithAutoAuth(api, phone, activeDeviceId, l);
              if (me.ok) {
                summary.alreadyOk += 1;
                await repo.markAttempt(acc.id, "OK", "session still valid");
                l.debug({ me: me.data }, "SESSION_OK_SKIP_LOGIN");

                const final = getStoredTokens(phone);
                if (final) {
                  await repo.updateTokens(acc.id, { accessToken: final.accessToken, refreshToken: final.refreshToken });
                }
                return;
              }

              l.debug({ reason: me.message }, "SESSION_NOT_OK_WILL_LOGIN");
            }


            const headers = buildHeaders(activeDeviceId);
            const lr = await loginWithOtpFlow(api, { phone, password }, headers, l);
            if (!lr.ok) {
              summary.fail += 1;
              await repo.markAttempt(acc.id, "FAIL", String(lr.reason ?? "LOGIN_FAIL"));
              l.debug({ reason: lr.reason }, "LOGIN_FLOW_FAIL");
              return;
            }


            summary.success += 1;
            summary.relogin += stored ? 1 : 0;

            const final = getStoredTokens(phone);
            if (final) {
              await repo.updateTokens(acc.id, { accessToken: final.accessToken, refreshToken: final.refreshToken });
              if (!acc.deviceId) {
                await repo.updateDeviceId(acc.id, activeDeviceId);
              }
            }

            await repo.markAttempt(acc.id, "OK", "login ok");
            const me2 = await getMeWithAutoAuth(api, phone, activeDeviceId, l);
            if (me2.ok) {
              l.debug({ me: me2.data }, "LOGIN_OK_ME_OK");
            } else {
              l.debug({ reason: me2.message }, "LOGIN_OK_BUT_ME_FAIL");
            }
          } catch (err: any) {
            summary.fail += 1;
            logger.debug({ err: err?.message ?? String(err) }, "ACCOUNT_PROCESS_ERROR");
          }
        })
      );
    }

    logger.debug({ summary }, "JOB_SUMMARY");
    return summary;

  } catch (err: any) {
    logger.error({ err: err?.message ?? String(err) }, "LOGIN_FROM_DB_CRASH");
    return summary;
  }
}
