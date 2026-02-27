import { AppDataSource } from "../config/data-source";
import { AppConfigEntity } from "./AppConfig.entity";

export const AppConfigRepository = AppDataSource.getRepository(AppConfigEntity).extend({
    async findConfigByAccountId(accountId: number): Promise<AppConfigEntity | null> {
        return this.findOne({ where: { accountId } });
    }
});
