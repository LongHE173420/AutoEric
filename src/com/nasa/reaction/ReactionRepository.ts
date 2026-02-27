import { AppDataSource } from "../config/data-source";
import { ReactionEntity } from "./Reaction.entity";

export const ReactionRepository = AppDataSource.getRepository(ReactionEntity).extend({
    async findByPostId(postId: string): Promise<ReactionEntity[]> {
        return this.find({ where: { postId } });
    },

    async findByAccountId(accountId: number): Promise<ReactionEntity[]> {
        return this.find({ where: { accountId } });
    }
});
