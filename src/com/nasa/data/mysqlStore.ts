import mysql from "mysql2/promise";
import { randomUUID } from "crypto";
import { ENV } from "../config/env";

function getLocalDateString(): string {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const vnTime = new Date(utc + (3600000 * 7));
    return `${vnTime.getFullYear()}-${String(vnTime.getMonth() + 1).padStart(2, "0")}-${String(vnTime.getDate()).padStart(2, "0")}`;
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

const MAX_POSTS_PER_VIDEO = 1;

export async function releaseVideoReservation(videoId?: number | null, claimToken?: string | null) {
    if (typeof videoId !== "number" || !Number.isFinite(videoId) || !claimToken) {
        return;
    }

    const conn = await getConnection();
    try {
        await conn.execute(
            `UPDATE crawled_videos
             SET claim_token = NULL,
                 claim_by = NULL,
                 claim_expires_at = NULL
             WHERE id = ?
               AND claim_token = ?`,
            [videoId, claimToken]
        );
    } finally {
        await conn.end();
    }
}

export async function getAccountsBatchFromDb(lastSeenId: number, limit: number): Promise<any[]> {
    const connection = await getConnection();
    try {
        const today = getLocalDateString();
        const [rows] = await connection.execute(
            `
            SELECT id, phone, password, deviceId, userAgent, accessToken, refreshToken
            FROM users
            WHERE id > ?
              AND (
                    daily_run_count < 2
                 OR last_run_date < ?
                 OR last_run_date IS NULL
              )
            ORDER BY id ASC
            LIMIT ?
            `,
            [Math.max(0, Number(lastSeenId) || 0), today, Math.max(1, Number(limit) || 1)]
        );
        return rows as any[];
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
        const [rows] = await connection.execute(
            `
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
            `,
            [currentPhone, currentPhone, currentPhone]
        );
        return rows as any[];
    } finally {
        await connection.end();
    }
}

export async function recordFriendRequest(senderPhone: string, receiverPhone: string, receiverId: string) {
    const connection = await getConnection();
    try {
        await connection.execute(
            `
            INSERT IGNORE INTO friend (sender_phone, receiver_phone, receiver_id, status)
            VALUES (?, ?, ?, 'PENDING')
            `,
            [senderPhone, receiverPhone, receiverId]
        );
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
        await connection.execute(
            `
            UPDATE users
            SET
                daily_run_count = IF(last_run_date = ?, daily_run_count + 1, 1),
                last_run_date = ?
            WHERE phone = ?
            `,
            [today, today, phone]
        );
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
    claimToken: string;
} | null> {
    const conn = await getConnection();
    try {
        const now = Date.now();
        const claimExpiresAt = now + Math.max(30_000, ENV.VIDEO_CLAIM_TTL_MS);
        const [rows]: any = await conn.execute(
            `SELECT v.id, v.source_url, v.video_url, v.local_path, v.caption, v.hashtags
             FROM crawled_videos v
             WHERE v.downloaded = 1
               AND v.local_path IS NOT NULL
               AND COALESCE(v.post_count, 0) < ?
               AND (v.claim_expires_at IS NULL OR v.claim_expires_at < ?)
               AND NOT EXISTS (
                 SELECT 1 FROM video_post_log l
                 WHERE l.video_id = v.id AND l.account_phone = ?
               )
             ORDER BY v.created_at ASC
             LIMIT 20`,
            [MAX_POSTS_PER_VIDEO, now, accountPhone]
        );
        if (!rows || rows.length === 0) {
            return null;
        }

        for (const row of rows as any[]) {
            const videoId = Number(row?.id);
            if (!Number.isFinite(videoId)) {
                continue;
            }

            const claimToken = randomUUID();
            const [claimRes]: any = await conn.execute(
                `UPDATE crawled_videos
                 SET claim_token = ?,
                     claim_by = ?,
                     claim_expires_at = ?
                 WHERE id = ?
                   AND downloaded = 1
                   AND local_path IS NOT NULL
                   AND COALESCE(post_count, 0) < ?
                   AND (claim_expires_at IS NULL OR claim_expires_at < ?)`,
                [claimToken, accountPhone, claimExpiresAt, videoId, MAX_POSTS_PER_VIDEO, now]
            );

            if (Number(claimRes?.affectedRows || 0) > 0) {
                return { ...row, claimToken };
            }
        }

        return null;
    } finally {
        await conn.end();
    }
}

export async function markVideoPosted(
    videoId: number,
    accountPhone: string,
    claimToken?: string | null
): Promise<{ localPath: string | null; fullyPosted: boolean }> {
    const conn = await getConnection();
    try {
        await conn.beginTransaction();

        if (claimToken) {
            const [claimRows]: any = await conn.execute(
                `SELECT id
                 FROM crawled_videos
                 WHERE id = ?
                   AND claim_token = ?
                 FOR UPDATE`,
                [videoId, claimToken]
            );

            if (!Array.isArray(claimRows) || claimRows.length === 0) {
                await conn.rollback();
                return { localPath: null, fullyPosted: false };
            }
        }

        const [insertRes]: any = await conn.execute(
            `INSERT IGNORE INTO video_post_log (video_id, account_phone) VALUES (?, ?)`,
            [videoId, accountPhone]
        );
        const inserted = Number(insertRes?.affectedRows || 0) > 0;
        if (inserted) {
            await conn.execute(
                `UPDATE crawled_videos SET post_count = COALESCE(post_count, 0) + 1 WHERE id = ?`,
                [videoId]
            );
        }

        const [rows]: any = await conn.execute(
            `SELECT local_path, post_count FROM crawled_videos WHERE id = ?`,
            [videoId]
        );
        const row = rows?.[0];
        const fullyPosted = row ? Number(row.post_count || 0) >= MAX_POSTS_PER_VIDEO : false;

        await conn.execute(
            fullyPosted && row?.local_path
                ? `UPDATE crawled_videos
                   SET local_path = NULL,
                       downloaded = 0,
                       claim_token = NULL,
                       claim_by = NULL,
                       claim_expires_at = NULL
                   WHERE id = ?`
                : `UPDATE crawled_videos
                   SET claim_token = NULL,
                       claim_by = NULL,
                       claim_expires_at = NULL
                   WHERE id = ?`,
            [videoId]
        );

        await conn.commit();
        return { localPath: row?.local_path ?? null, fullyPosted };
    } catch (err) {
        try { await conn.rollback(); } catch { }
        throw err;
    } finally {
        await conn.end();
    }
}

export async function deleteVideoFromQueue(videoId: number, claimToken?: string | null): Promise<void> {
    const conn = await getConnection();
    try {
        await conn.execute(
            `UPDATE crawled_videos
             SET local_path = NULL,
                 downloaded = 0,
                 claim_token = NULL,
                 claim_by = NULL,
                 claim_expires_at = NULL
             WHERE id = ?
               AND (? IS NULL OR claim_token = ?)`,
            [videoId, claimToken ?? null, claimToken ?? null]
        );
    } finally {
        await conn.end();
    }
}

export async function updateFriendRequestStatus(senderId: string, receiverPhone: string, status: string) {
    const connection = await getConnection();
    try {
        await connection.execute(
            `
            UPDATE friend f
            INNER JOIN users u ON u.phone = f.sender_phone
            SET f.status = ?
            WHERE f.receiver_phone = ? AND u.app_user_id = ?
            `,
            [status, receiverPhone, senderId]
        );
    } catch (error) {
        console.error("Error updating friend request status:", error);
    } finally {
        await connection.end();
    }
}
