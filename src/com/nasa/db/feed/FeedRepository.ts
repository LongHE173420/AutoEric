import { AppDataSource } from "../../config/data-source";
import { FeedEntity } from "./Feed.entity";

export const FeedRepository = AppDataSource.getRepository(FeedEntity).extend({
    async findLatestFeedByAccountId(accountId: number): Promise<FeedEntity[]> {
        return this.find({ where: { accountId }, order: { createdAt: 'DESC' }, take: 20 });
    }
});
