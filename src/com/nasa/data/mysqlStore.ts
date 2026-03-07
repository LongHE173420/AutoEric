import mysql from 'mysql2/promise';
import { ENV } from '../config/env';

export async function getAccountsFromDb(): Promise<any[]> {
    const connection = await mysql.createConnection({
        host: ENV.DB_HOST,
        user: ENV.DB_USER,
        password: ENV.DB_PASS,
        database: ENV.DB_NAME
    });

    try {
        const [rows] = await connection.execute("SELECT phone, password, deviceId, userAgent, accessToken, refreshToken FROM users");
        return rows as any[];
    } finally {
        await connection.end();
    }
}

export async function saveTokensToDb(phone: string, accessToken: string, refreshToken: string) {
    const connection = await mysql.createConnection({
        host: ENV.DB_HOST,
        user: ENV.DB_USER,
        password: ENV.DB_PASS,
        database: ENV.DB_NAME
    });
    try {
        await connection.execute("UPDATE users SET accessToken = ?, refreshToken = ? WHERE phone = ?", [accessToken, refreshToken, phone]);
    } finally {
        await connection.end();
    }
}
