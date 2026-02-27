import { AppDataSource } from "../config/data-source";
import { FriendEntity } from "./Friend.entity";

export const FriendRepository = AppDataSource.getRepository(FriendEntity).extend({
    async findFriendsByAccountId(accountId: number): Promise<FriendEntity[]> {
        return this.find({ where: { accountId, status: 'ACCEPTED' } });
    }
});
