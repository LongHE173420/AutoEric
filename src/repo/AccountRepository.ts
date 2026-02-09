import { AppDataSource } from "../config/data-source";
import { AccountEntity } from "../entities/Account.entity";

export class AccountRepository {
    private get repo() {
        return AppDataSource.getRepository(AccountEntity);
    }

    async findEnabledAccounts(limit: number = 200): Promise<AccountEntity[]> {
        return this.repo.find({
            order: { id: "ASC" },
            take: limit
        });
    }

    async markAttempt(_id: number, _status: string, _message: string): Promise<void> {
        return;
    }
}
