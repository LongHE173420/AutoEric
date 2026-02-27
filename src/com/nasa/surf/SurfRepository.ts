import { AppDataSource } from "../config/data-source";
import { SurfEntity } from "./Surf.entity";

export const SurfRepository = AppDataSource.getRepository(SurfEntity).extend({
    async findLatestSurfByAccountId(accountId: number): Promise<SurfEntity[]> {
        return this.find({ where: { accountId }, order: { createdAt: 'DESC' }, take: 20 });
    }
});
