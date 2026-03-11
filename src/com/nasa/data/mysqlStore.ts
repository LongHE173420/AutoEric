import mysql from 'mysql2/promise';
import { ENV } from '../config/env';

async function getConnection() {
    return await mysql.createConnection({
        host: ENV.DB_HOST,
        user: ENV.DB_USER,
        password: ENV.DB_PASS,
        database: ENV.DB_NAME
    });
}

async function initDbColumns(connection: mysql.Connection) {
    try {
        await connection.execute("ALTER TABLE users ADD COLUMN daily_run_count INT DEFAULT 0");
    } catch (e) { }
    try {
        await connection.execute("ALTER TABLE users ADD COLUMN last_run_date DATE");
    } catch (e) { }
}

export async function getAccountsFromDb(): Promise<any[]> {
    const connection = await getConnection();
    try {
        await initDbColumns(connection);
        const [rows] = await connection.execute(`
            SELECT phone, password, deviceId, userAgent, accessToken, refreshToken 
            FROM users 
            WHERE daily_run_count < 2 
               OR last_run_date < CURDATE() 
               OR last_run_date IS NULL
        `);
        return rows as any[];
    } finally {
        await connection.end();
    }
}

export async function saveTokensToDb(phone: string, accessToken: string, refreshToken: string) {
    const connection = await getConnection();
    try {
        await connection.execute("UPDATE users SET accessToken = ?, refreshToken = ? WHERE phone = ?", [accessToken, refreshToken, phone]);
    } finally {
        await connection.end();
    }
}

export async function recordRunInDb(phone: string) {
    const connection = await getConnection();
    try {
        await initDbColumns(connection);
        await connection.execute(`
            UPDATE users 
            SET 
                daily_run_count = IF(last_run_date = CURDATE(), daily_run_count + 1, 1),
                last_run_date = CURDATE()
            WHERE phone = ?
        `, [phone]);
    } catch (e) {
        console.error("Failed to update daily_run_count for", phone, e);
    } finally {
        await connection.end();
    }
}
