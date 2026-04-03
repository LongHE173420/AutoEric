import mysql from 'mysql2/promise';
import { ENV } from '../config/env';

function getLocalDateString(): string {
    const d = new Date();
    // Offset standard UTC minutes and add +7 hours for Vietnam
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const vnTime = new Date(utc + (3600000 * 7));
    return `${vnTime.getFullYear()}-${String(vnTime.getMonth() + 1).padStart(2, '0')}-${String(vnTime.getDate()).padStart(2, '0')}`;
}

async function getConnection() {
    return await mysql.createConnection({
        host: ENV.DB_HOST,
        user: ENV.DB_USER,
        password: ENV.DB_PASS,
        database: ENV.DB_NAME
    });
}

export type AppDataAccountRow = {
    id: number;
    phone: string;
    deviceId?: string | null;
    userAgent?: string | null;
    app_user_id?: string | null;
    daily_run_count?: number | null;
    last_run_date?: string | null;
    accessToken?: string | null;
    refreshToken?: string | null;
};

const reservedVideoLocks = new Map<number, mysql.Connection>();

function getVideoLockName(videoId: number) {
    return `autoe:video:${videoId}`;
}

async function acquireVideoReservation(videoId: number): Promise<boolean> {
    const existing = reservedVideoLocks.get(videoId);
    if (existing) return false;

    const conn = await getConnection();
    try {
        const [rows]: any = await conn.execute(
            `SELECT GET_LOCK(?, 0) AS acquired`,
            [getVideoLockName(videoId)]
        );
        const acquired = Number(rows?.[0]?.acquired || 0) === 1;
        if (!acquired) {
            await conn.end();
            return false;
        }

        reservedVideoLocks.set(videoId, conn);
        return true;
    } catch (err) {
        try { await conn.end(); } catch { }
        return false;
    }
}

export async function releaseVideoReservation(videoId?: number | null) {
    if (typeof videoId !== "number" || !Number.isFinite(videoId)) {
        return;
    }

    const conn = reservedVideoLocks.get(videoId);
    if (!conn) {
        return;
    }

    reservedVideoLocks.delete(videoId);
    try {
        await conn.execute(`SELECT RELEASE_LOCK(?)`, [getVideoLockName(videoId)]);
    } catch {
        // ignore release errors
    } finally {
        try { await conn.end(); } catch { }
    }
}



export async function getAccountsFromDb(): Promise<any[]> {
    const connection = await getConnection();
    try {
        const today = getLocalDateString();
        const [rows] = await connection.execute(`
            SELECT phone, password, deviceId, userAgent, accessToken, refreshToken 
            FROM users 
            WHERE daily_run_count < 2 
               OR last_run_date < ? 
               OR last_run_date IS NULL
        `, [today]);
        return rows as any[];
    } finally {
        await connection.end();
    }
}

export async function getAppDataAccountsFromDb(): Promise<AppDataAccountRow[]> {
    const connection = await getConnection();
    try {
        const [rows] = await connection.execute(`
            SELECT id, phone, deviceId, userAgent, app_user_id, daily_run_count, last_run_date, accessToken, refreshToken
            FROM users
            ORDER BY id ASC
        `);
        return rows as AppDataAccountRow[];
    } finally {
        await connection.end();
    }
}

export async function saveAppUserId(phone: string, appUserId: string) {
    const connection = await getConnection();
    try {
        await connection.execute("UPDATE users SET app_user_id = ? WHERE phone = ?", [appUserId, phone]);
    } catch (e: any) {
        console.error("Failed to save app_user_id for", phone, e.message);
    } finally {
        await connection.end();
    }
}

export async function getUsersForFriendRequest(currentPhone: string, limit: number): Promise<any[]> {
    const connection = await getConnection();
    try {
        const [rows] = await connection.execute(`
            SELECT phone, app_user_id 
            FROM users 
            WHERE app_user_id IS NOT NULL 
              AND phone != ?
              AND phone NOT IN (
                  SELECT receiver_phone FROM friend WHERE sender_phone = ?
                  UNION
                  SELECT sender_phone FROM friend WHERE receiver_phone = ?
              )
            ORDER BY id ASC
            LIMIT ${Number(limit)}
        `, [currentPhone, currentPhone, currentPhone]);
        return rows as any[];
    } finally {
        await connection.end();
    }
}

export async function recordFriendRequest(senderPhone: string, receiverPhone: string, receiverId: string) {
    const connection = await getConnection();
    try {
        await connection.execute(`
            INSERT IGNORE INTO friend (sender_phone, receiver_phone, receiver_id, status)
            VALUES (?, ?, ?, 'PENDING')
        `, [senderPhone, receiverPhone, receiverId]);
    } catch (e: any) {
        console.error("Failed to record friend request", senderPhone, "->", receiverPhone, e.message);
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

        const today = getLocalDateString();
        await connection.execute(`
            UPDATE users 
            SET 
                daily_run_count = IF(last_run_date = ?, daily_run_count + 1, 1),
                last_run_date = ?
            WHERE phone = ?
        `, [today, today, phone]);
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
             LIMIT 20`,
            [accountPhone]
        );
        if (!rows || rows.length === 0) return null;

        for (const row of rows as any[]) {
            const videoId = Number(row?.id);
            if (!Number.isFinite(videoId)) {
                continue;
            }
            const acquired = await acquireVideoReservation(videoId);
            if (acquired) {
                return row;
            }
        }

        return null;
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
        const [insertRes]: any = await conn.execute(
            `INSERT IGNORE INTO video_post_log (video_id, account_phone) VALUES (?, ?)`,
            [videoId, accountPhone]
        );
        const inserted = Number(insertRes?.affectedRows || 0) > 0;
        if (inserted) {
            await conn.execute(
                `UPDATE crawled_videos SET post_count = post_count + 1 WHERE id = ?`,
                [videoId]
            );
        }
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
        await releaseVideoReservation(videoId);
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
        await releaseVideoReservation(videoId);
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

export async function updateFriendRequestStatus(senderId: string, receiverPhone: string, status: string) {
    const connection = await getConnection();
    try {
        await connection.execute(`
            UPDATE friend f
            INNER JOIN users u ON u.phone = f.sender_phone
            SET f.status = ?
            WHERE f.receiver_phone = ? AND u.app_user_id = ?
        `, [status, receiverPhone, senderId]);
    } catch (error) {
        console.error("Error updating friend request status:", error);
    }
}
