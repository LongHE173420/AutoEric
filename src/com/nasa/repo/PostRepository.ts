import { AppDataSource } from "../config/data-source";
import { PostEntity } from "../entity/Post.entity";

export const PostRepository = AppDataSource.getRepository(PostEntity).extend({
    // TODO: Add custom query methods here

    // async findRecentPosts() {
    //     return this.find({ order: { createdAt: "DESC" }, take: 10 });
    // }
});
