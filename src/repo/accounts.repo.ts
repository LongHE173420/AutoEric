import { ENV } from "../config/env";
import { getMysqlPool } from "../config/database";

export type DbAccount = {
  id: number;
  username: string;
  password: string;
};

function ident(name: string): string {
  const v = String(name || "").trim();
  if (!/^[a-zA-Z0-9_]+$/.test(v)) {
    throw new Error(`BAD_IDENTIFIER:${v}`);
  }
  return `\`${v}\``;
}


export async function fetchEnabledAccounts(limit: number = 200): Promise<DbAccount[]> {
  const pool = getMysqlPool();

  const table = ident(ENV.USERS_TABLE);
  const userCol = ident(ENV.USERS_USERNAME_COL);
  const passCol = ident(ENV.USERS_PASSWORD_COL);

  const sql = `SELECT id, ${userCol} AS username, ${passCol} AS password FROM ${table} ORDER BY id ASC LIMIT ?`;
  const [rows] = (await pool.query(sql, [limit])) as any;

  const list = Array.isArray(rows) ? rows : [];
  return list.map((r: any) => ({
    id: Number(r.id),
    username: String(r.username ?? ""),
    password: String(r.password ?? ""),
  }));
}
export async function markAccountAttempt(_id: number, _status: string, _message: string) {
  return;
}
