import type { Logger } from "pino";
import { AuthServiceApi } from "../api/authService";
import { AccountRepository} from "../repo/AccountRepository";
import { maskPassword, maskToken } from "../utils/logMask";

import { getStoredTokens } from "../storage/tokenStore";
import { getMeWithAutoAuth } from "./protectedApi";
import { loginWithOtpFlow } from "./loginFlow";
import { ensureLogin } from "./loginFlow";
import { AccountService } from "./AccountService"
import { AccountEntity } from "../entities/Account.entity";
import { getDeviceId } from "../utils/device";
import { buildHeaders } from "../utils/headers";


export type LoginSummary = {
  success: number;
  alreadyOk: number;
  relogin: number;
  fail: number;
  accounts: number;
};

type AccountRow = {
  id: number;
  username: string;
  password: string;
};

export class LoginService {
  private readonly api: AuthServiceApi;
  private readonly logger: Logger;
  private readonly deviceId: string;
  private readonly repo = new AccountRepository();
private readonly service: AccountService;

  private readonly BATCH_SIZE = 5;

  constructor(api: AuthServiceApi, logger: Logger) {
    this.api = api;
    this.logger = logger.child({ job: "LoginFromDbJob" });
    this.deviceId = "xxxxxxxxxxxxxxx";
    this.service = new AccountService();
  }

  async run(): Promise<LoginSummary> {
    const summary = this.initSummary(0);
    const tasks: Promise<void>[] = [];
    try {
      const accounts: AccountEntity[] = await this.service.getAccount(1000);

      this.logger.debug({ accounts: accounts.length},"DB_ACCOUNTS_LOADED");

      summary.accounts = accounts.length;

      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];

        const task = this.processAccount(acc, i + 1, summary);
        tasks.push(task);
      }
      await Promise.all(tasks);
      this.logger.info({ summary }, "JOB_SUMMARY");
      return summary;
    } catch (err: any) {
      this.logger.error(
        { err: err?.message ?? String(err) },
        "LOGIN_FROM_DB_JOB_ERROR"
      );

      return summary;
    }
  }


  // ===================== private methods =====================

  private async processAccount(
    acc: AccountEntity,
    rowNo: number,
    summary: LoginSummary
  ): Promise<void> {
    const username = String(acc.phone || "").replace(/\D/g, "");
    const password = String(acc.password || "");
    let deviceId: string;
    const log = this.logger.child({
      row: rowNo,
      accId: acc.id,
      username,
    });

    log.debug({ password: maskPassword(password) }, "ACCOUNT_START");

    if (!username || !password) {
      summary.fail += 1;
      await this.repo.markAttempt(acc.id, "INVALID", "missing username/password");
      log.warn({}, "ACCOUNT_INVALID_SKIP");
      return;
    }

    try {
      if (!acc.deviceId){
        deviceId = getDeviceId();
      }
      else deviceId = acc.deviceId
      if(!acc.refreshToken){
        // Khong co refreshToken gui login bang username va password
         const lr = await loginWithOtpFlow(
        this.api,
        { phone: acc.phone, password: acc.password },
        deviceId,
        log
      );
      }
      else{
        // Co refersh token login bang refresh token
       const lr = await  ensureLogin(this.api, { phone: acc.phone, password: acc.password }, deviceId, log);

      }

      

   
   
      // summary.success += 1;
      // summary.relogin += stored ? 1 : 0;

      await this.repo.markAttempt(acc.id, "OK", "login ok");

      const me2 = await getMeWithAutoAuth(
        this.api,
        username,
        this.deviceId,
        log
      );

      if (me2.ok) {
        log.debug({ me: me2.data }, "LOGIN_OK_ME_OK");
      } else {
        log.warn({ reason: me2.message }, "LOGIN_OK_BUT_ME_FAIL");
      }
    } catch (err: any) {
      summary.fail += 1;
      log.error({ err: err?.message ?? err }, "ACCOUNT_PROCESS_ERROR");
    }
  }

  private initSummary(accounts: number): LoginSummary {
    return {
      success: 0,
      alreadyOk: 0,
      relogin: 0,
      fail: 0,
      accounts,
    };
  }

  private emptySummary(): LoginSummary {
    return this.initSummary(0);
  }
}
