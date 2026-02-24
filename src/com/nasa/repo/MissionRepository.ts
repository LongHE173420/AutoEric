import { AppDataSource } from "../config/data-source";
import { MissionEntity } from "../entity/Mission.entity";

export const MissionRepository = AppDataSource.getRepository(MissionEntity).extend({
    // TODO: Add custom query methods here

    // async findActiveMissions() {
    //     return this.find({ where: { isActive: true } });
    // }
});
