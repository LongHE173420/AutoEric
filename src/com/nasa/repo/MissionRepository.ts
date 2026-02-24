import { AppDataSource } from "../config/data-source";
import { MissionEntity } from "../entity/Mission.entity";

export const MissionRepository = AppDataSource.getRepository(MissionEntity).extend({

});
