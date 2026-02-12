import { AuthServiceApi } from "../connection/api/authService";
import { AccountRepository } from "../repo/AccountRepository";
import { AccountEntity } from "../entity/Account.entity";
import { maskPassword, maskToken, Log } from "../utils/log";
import { buildHeaders } from "../utils/headers";
import { getStoredTokens, setStoredTokens } from "../storage/tokenStore";
import { getMeWithAutoAuth, loginWithOtpFlow } from "../connection/service/loginFlow";


export type UserWorkerResult = {
    success: boolean;
    relogin: boolean;
    alreadyOk: boolean;
    reason?: string;
};

type AppLogger = ReturnType<typeof Log.getLogger>;

export class UserWorker {
    private logger: AppLogger;

    constructor(
        private readonly acc: AccountEntity,
        private readonly api: AuthServiceApi,
        private readonly repo: AccountRepository,
        parentLogger: AppLogger,
        private readonly defaultDeviceId: string,
        private readonly rowNo: number
    ) {
        this.logger = parentLogger;
    }
    private logContext() {
        const phone = String(this.acc.phone || "").replace(/\D/g, "");
        return { row: this.rowNo, accId: this.acc.id, phone };
    }

    async run(): Promise<UserWorkerResult> {
        const phone = String(this.acc.phone || "").replace(/\D/g, "");
        const password = String(this.acc.password || "");
        const activeDeviceId = this.acc.deviceId || this.defaultDeviceId;
        const ctx = this.logContext();

        this.logger.debug("ACCOUNT_START", { ...ctx, password: maskPassword(password) });

        if (!phone || !password) {
            await this.repo.markAttempt(this.acc.id, "INVALID", "missing phone/password");
            this.logger.warn("ACCOUNT_INVALID_SKIP", ctx);
            return { success: false, relogin: false, alreadyOk: false, reason: "INVALID_CREDENTIALS" };
        }

        try {
            if (this.acc.accessToken && this.acc.refreshToken) {
                setStoredTokens(phone, this.acc.accessToken, this.acc.refreshToken, activeDeviceId);
            }
            const stored = getStoredTokens(phone);
            if (stored) {
                this.logger.debug("TOKENS_FOUND",
                    {
                        ...ctx,
                        accessToken: maskToken(stored.accessToken),
                        refreshToken: maskToken(stored.refreshToken),
                    }
                );
                const me = await getMeWithAutoAuth(this.api, phone, activeDeviceId, this.logger);
                if (me.ok) {
                    await this.repo.markAttempt(this.acc.id, "OK", "session still valid");
                    this.logger.debug("SESSION_OK_SKIP_LOGIN", { ...ctx, me: me.data });

                    const final = getStoredTokens(phone);
                    if (final) {
                        await this.repo.updateTokens(this.acc.id, { accessToken: final.accessToken, refreshToken: final.refreshToken });
                    }
                    return { success: true, relogin: false, alreadyOk: true };
                }

                this.logger.debug("SESSION_NOT_OK_WILL_LOGIN", { ...ctx, reason: me.message });
            }

            const headers = buildHeaders(activeDeviceId);
            const lr = await loginWithOtpFlow(this.api, { phone, password }, headers, this.logger);

            if (!lr.ok) {
                await this.repo.markAttempt(this.acc.id, "FAIL", String(lr.reason ?? "LOGIN_FAIL"));
                this.logger.debug("LOGIN_FLOW_FAIL", { ...ctx, reason: lr.reason });
                return { success: false, relogin: false, alreadyOk: false, reason: lr.reason };
            }
            const final = getStoredTokens(phone);
            if (final) {
                await this.repo.updateTokens(this.acc.id, { accessToken: final.accessToken, refreshToken: final.refreshToken });
                if (!this.acc.deviceId) {
                    await this.repo.updateDeviceId(this.acc.id, activeDeviceId);
                }
            }
            await this.repo.markAttempt(this.acc.id, "OK", "login ok");
            const me2 = await getMeWithAutoAuth(this.api, phone, activeDeviceId, this.logger);
            if (me2.ok) {
                this.logger.debug("LOGIN_OK_ME_OK", { ...ctx, me: me2.data });
            } else {
                this.logger.debug("LOGIN_OK_BUT_ME_FAIL", { ...ctx, reason: me2.message });
            }

            return { success: true, relogin: !!stored, alreadyOk: false };

        } catch (err: any) {
            this.logger.debug("ACCOUNT_PROCESS_ERROR", { ...ctx, err: err?.message ?? String(err) });
            return { success: false, relogin: false, alreadyOk: false, reason: "EXCEPTION" };
        }
    }
}
