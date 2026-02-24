import { AppDataSource } from "../config/data-source";
import { PostEntity } from "../entity/Post.entity";

export const PostRepository = AppDataSource.getRepository(PostEntity).extend({

});
