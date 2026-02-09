import type { Logger } from "pino";
import { AuthServiceApi } from "../api/authService";
import { fetchEnabledAccounts, markAccountAttempt } from "../repo/accounts.repo";
import { maskPassword, maskToken } from "../utils/logMask";
import { getDeviceId } from "../device/deviceId";
import { getStoredTokens } from "./tokenStore";
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
  const deviceId = getDeviceId();

  let accounts = [] as Array<{ id: number; username: string; password: string }>;
  try {
    accounts = await fetchEnabledAccounts(1000);
  } catch (err: any) {
    logger.error({ err: err?.message ?? String(err) }, "DB_FETCH_ACCOUNTS_ERROR");
    return { success: 0, alreadyOk: 0, relogin: 0, fail: 0, accounts: 0 };
  }

  logger.debug({ accounts: accounts.length, deviceId }, "DB_ACCOUNTS_LOADED");

  const summary: LoginSummary = {
    success: 0,
    alreadyOk: 0,
    relogin: 0,
    fail: 0,
    accounts: accounts.length,
  };

  const BATCH_SIZE = 5;
  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (acc, idx) => {
        const rowNo = i + idx + 1;
        const username = String(acc.username || "").replace(/\D/g, "");
        const password = String(acc.password || "");

        const l = logger.child({ row: rowNo, accId: acc.id, username });
        l.debug({ password: maskPassword(password) }, "ACCOUNT_START");

        if (!username || !password) {
          summary.fail += 1;
          await markAccountAttempt(acc.id, "INVALID", "missing username/password");
          l.warn({}, "ACCOUNT_INVALID_SKIP");
          return;
        }

        try {
          const stored = getStoredTokens(username);
          if (stored) {
            l.debug(
              {
                accessToken: maskToken(stored.accessToken),
                refreshToken: maskToken(stored.refreshToken),
              },
              "TOKENS_FOUND"
            );

            const me = await getMeWithAutoAuth(api, username, deviceId, l);
            if (me.ok) {
              summary.alreadyOk += 1;
              await markAccountAttempt(acc.id, "OK", "session still valid");
              l.debug({ me: me.data }, "SESSION_OK_SKIP_LOGIN");
              return;
            }

            l.debug({ reason: me.message }, "SESSION_NOT_OK_WILL_LOGIN");
          }

          const lr = await loginWithOtpFlow(api, { username, password }, deviceId, l);
          if (!lr.ok) {
            summary.fail += 1;
            await markAccountAttempt(acc.id, "FAIL", String(lr.reason ?? "LOGIN_FAIL"));
            l.debug({ reason: lr.reason }, "LOGIN_FLOW_FAIL");
            return;
          }

          summary.success += 1;
          summary.relogin += stored ? 1 : 0;
          await markAccountAttempt(acc.id, "OK", "login ok");
          const me2 = await getMeWithAutoAuth(api, username, deviceId, l);
          if (me2.ok) {
            l.debug({ me: me2.data }, "LOGIN_OK_ME_OK");
          } else {
            l.debug({ reason: me2.message }, "LOGIN_OK_BUT_ME_FAIL");
          }
        } catch (err: any) {
          summary.fail += 1;
          l.debug({ err: err?.message }, "ACCOUNT_PROCESS_ERROR");
        }
      })
    );
  }

  logger.debug({ summary }, "JOB_SUMMARY");
  return summary;
}
