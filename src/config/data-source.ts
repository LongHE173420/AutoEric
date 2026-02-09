import "reflect-metadata";
import { DataSource } from "typeorm";
import { ENV } from "./env";
import { AccountEntity } from "../entities/Account.entity";

export const AppDataSource = new DataSource({
    type: "mysql",
    host: ENV.MYSQL_HOST,
    port: ENV.MYSQL_PORT,
    username: ENV.MYSQL_USER,
    password: ENV.MYSQL_PASSWORD,
    database: ENV.MYSQL_DATABASE,
    synchronize: false, // Production safe
    logging: ENV.LOG_LEVEL === "debug" || ENV.LOG_VERBOSE,
    entities: [AccountEntity],
    migrations: [],
    subscribers: [],
    extra: {
        connectionLimit: ENV.MYSQL_CONN_LIMIT
    }
});
