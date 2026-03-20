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


export async function getNextVideoToPost(accountPhone: string): Promise<{
    id: number;
    source_url: string;
    video_url: string;
    local_path: string;
    caption: string;
    hashtags: string;
} | null> {
    const conn = await getConnection();
    try {
        const [rows]: any = await conn.execute(
            `SELECT v.id, v.source_url, v.video_url, v.local_path, v.caption, v.hashtags
             FROM crawled_videos v
             WHERE v.downloaded = 1
               AND v.local_path IS NOT NULL
               AND v.post_count < v.max_posts
               AND NOT EXISTS (
                 SELECT 1 FROM video_post_log l
                 WHERE l.video_id = v.id AND l.account_phone = ?
               )
             ORDER BY v.created_at ASC
             LIMIT 1`,
            [accountPhone]
        );
        if (!rows || rows.length === 0) return null;
        return rows[0];
    } finally {
        await conn.end();
    }
}

export async function markVideoPosted(
    videoId: number,
    accountPhone: string
): Promise<{ localPath: string | null; fullyPosted: boolean }> {
    const conn = await getConnection();
    try {
        await conn.execute(
            `INSERT IGNORE INTO video_post_log (video_id, account_phone) VALUES (?, ?)`,
            [videoId, accountPhone]
        );
        await conn.execute(
            `UPDATE crawled_videos SET post_count = post_count + 1 WHERE id = ?`,
            [videoId]
        );
        // Kiểm tra đã đăng đủ số lần chưa
        const [rows]: any = await conn.execute(
            `SELECT local_path, post_count, max_posts FROM crawled_videos WHERE id = ?`,
            [videoId]
        );
        const row = rows?.[0];
        const fullyPosted = row ? row.post_count >= row.max_posts : false;
        if (fullyPosted && row?.local_path) {
            // Xóa local_path trong DB để đánh dấu đã dọn
            await conn.execute(
                `UPDATE crawled_videos SET local_path = NULL, downloaded = 0 WHERE id = ?`,
                [videoId]
            );
        }
        return { localPath: row?.local_path ?? null, fullyPosted };
    } finally {
        await conn.end();
    }
}

/** Dọn dẹp file local của các video đã đăng đủ số lần (safety net) */
export async function deleteVideoFromQueue(videoId: number): Promise<void> {
    const conn = await getConnection();
    try {
        await conn.execute(
            `UPDATE crawled_videos
             SET local_path = NULL, downloaded = 0
             WHERE id = ?`,
            [videoId]
        );
    } finally {
        await conn.end();
    }
}

export async function cleanupFullyPostedVideos(): Promise<number> {
    const conn = await getConnection();
    try {
        const [rows]: any = await conn.execute(
            `SELECT id, local_path FROM crawled_videos
             WHERE post_count >= max_posts AND local_path IS NOT NULL AND downloaded = 1`
        );
        let cleaned = 0;
        for (const row of rows as { id: number; local_path: string }[]) {
            try {
                const fs = await import('fs');
                if (fs.existsSync(row.local_path)) {
                    fs.unlinkSync(row.local_path);
                    cleaned++;
                }
            } catch (e: any) {
                console.warn(`[CLEANUP] Cannot delete ${row.local_path}: ${e.message}`);
            }
            await conn.execute(
                `UPDATE crawled_videos SET local_path = NULL, downloaded = 0 WHERE id = ?`,
                [row.id]
            );
        }
        return cleaned;
    } finally {
        await conn.end();
    }
}
