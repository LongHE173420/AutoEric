import { AppDataSource } from "../vn.com.nasa.config/data-source";
import { AccountEntity } from "../vn.com.nasa.entity/Account.entity";

export class AccountRepository {
    private get repo() {
        return AppDataSource.getRepository(AccountEntity);
    }

    findEnabledAccounts(limit: number = 200): Promise<AccountEntity[]> {
        return this.repo.find({
            where: { revoked: false },
            order: { id: "ASC" },
            take: limit
        });
    }

    updateTokens(id: number, tokens: { accessToken: string; refreshToken: string }): Promise<any> {
        return this.repo.update(id, {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            updatedAt: new Date()
        });
    }

    updateDeviceId(id: number, deviceId: string): Promise<any> {
        return this.repo.update(id, {
            deviceId: deviceId,
            updatedAt: new Date()
        });
    }

    markAttempt(_id: number, _status: string, _message: string): Promise<any> {
        return this.repo.update(_id, { updatedAt: new Date() });
    }
}
