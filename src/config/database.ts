import mysql from "mysql2/promise";
import type { Pool } from "mysql2/promise";
import { ENV } from "./env";

let pool: Pool | null = null;

export function getMysqlPool(): Pool {
  if (pool) return pool;

  pool = mysql.createPool({
    host: ENV.MYSQL_HOST,
    port: ENV.MYSQL_PORT,
    user: ENV.MYSQL_USER,
    password: ENV.MYSQL_PASSWORD,
    database: ENV.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: ENV.MYSQL_CONN_LIMIT,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });
  return pool;
}

export async function pingMysql(): Promise<void> {
  const p = getMysqlPool();
  await p.query("SELECT 1");
}

export async function closeMysqlPool(): Promise<void> {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end();
}
