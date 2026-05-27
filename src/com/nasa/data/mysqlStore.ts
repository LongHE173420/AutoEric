import mysql from "mysql2/promise";
import * as fs from "fs";
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
        port: ENV.DB_PORT,
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
    daily_post_count?: number | null;
    daily_surf_count?: number | null;
    daily_limit_date?: string | null;
    last_run_date?: string | null;
    accessToken?: string | null;
    refreshToken?: string | null;
};

const MAX_POSTS_PER_VIDEO = 1;

async function resetQueuedVideoState(conn: mysql.Connection, videoId: number) {
    await conn.execute(
        `UPDATE crawled_videos1
         SET local_path = NULL,
             downloaded = 0
         WHERE id = ?`,
        [videoId]
    );
}

export async function releaseVideoReservation(videoId?: number | null, claimToken?: string | null) {
    return;
}

export async function getAccountsBatchFromDb(lastSeenId: number, limit: number): Promise<any[]> {
    const connection = await getConnection();
    try {
        const today = getLocalDateString();
        const maxDailyRuns = Math.max(1, ENV.ACCOUNT_DAILY_RUN_LIMIT);
        const safeLastSeenId = Number.isFinite(Number(lastSeenId)) ? Number(lastSeenId) : 0;
        const [rows] = await connection.execute(
            `
            SELECT
                id,
                phone,
                password,
                deviceId,
                userAgent,
                accessToken,
                refreshToken,
                CASE
                    WHEN daily_limit_date = ? THEN COALESCE(daily_run_count, 0)
                    ELSE 0
                END AS daily_run_count,
                CASE
                    WHEN daily_limit_date = ? THEN COALESCE(daily_post_count, 0)
                    ELSE 0
                END AS daily_post_count,
                CASE
                    WHEN daily_limit_date = ? THEN COALESCE(daily_surf_count, 0)
                    ELSE 0
                END AS daily_surf_count,
                daily_limit_date,
                last_run_date
            FROM user1
            WHERE id > ?
              AND (
                    daily_limit_date IS NULL
                 OR daily_limit_date < ?
                 OR COALESCE(daily_run_count, 0) < ?
              )
            ORDER BY id ASC
            LIMIT ?
            `,
            [
                today,
                today,
                today,
                safeLastSeenId,
                today,
                maxDailyRuns,
                Math.max(1, Number(limit) || 1)
            ]
        );
        return rows as any[];
    } finally {
        await connection.end();
    }
}

export async function saveAppUserId(phone: string, appUserId: string) {
    const connection = await getConnection();
    try {
        await connection.execute("UPDATE user1 SET app_user_id = ? WHERE phone = ?", [appUserId, phone]);
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
            FROM user1
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
        await connection.execute("UPDATE user1 SET accessToken = ?, refreshToken = ? WHERE phone = ?", [accessToken, refreshToken, phone]);
    } finally {
        await connection.end();
    }
}

export async function recordRunInDb(phone: string) {
    const connection = await getConnection();
    try {
        const today = getLocalDateString();
        const maxDailyRuns = Math.max(1, ENV.ACCOUNT_DAILY_RUN_LIMIT);
        await connection.execute(
            `
            UPDATE user1
            SET
                daily_run_count = CASE
                    WHEN daily_limit_date = ? THEN LEAST(?, COALESCE(daily_run_count, 0) + 1)
                    ELSE 1
                END,
                daily_post_count = CASE
                    WHEN daily_limit_date = ? THEN COALESCE(daily_post_count, 0)
                    ELSE 0
                END,
                daily_surf_count = CASE
                    WHEN daily_limit_date = ? THEN COALESCE(daily_surf_count, 0)
                    ELSE 0
                END,
                daily_limit_date = ?,
                last_run_date = ?
            WHERE phone = ?
            `,
            [today, maxDailyRuns, today, today, today, today, phone]
        );
    } catch (e) {
        console.error("Failed to update daily_run_count for", phone, e);
    } finally {
        await connection.end();
    }
}

export async function recordDailyPublishInDb(phone: string, type: "post" | "surf") {
    const connection = await getConnection();
    try {
        const today = getLocalDateString();
        const maxDailyPosts = Math.max(0, ENV.ACCOUNT_DAILY_POST_LIMIT);
        const maxDailySurfs = Math.max(0, ENV.ACCOUNT_DAILY_SURF_LIMIT);
        await connection.execute(
            `
            UPDATE user1
            SET
                daily_run_count = CASE
                    WHEN daily_limit_date = ? THEN COALESCE(daily_run_count, 0)
                    ELSE 0
                END,
                daily_post_count = CASE
                    WHEN ? = 'post' THEN
                        CASE
                            WHEN daily_limit_date = ? THEN LEAST(?, COALESCE(daily_post_count, 0) + 1)
                            ELSE 1
                        END
                    ELSE
                        CASE
                            WHEN daily_limit_date = ? THEN COALESCE(daily_post_count, 0)
                            ELSE 0
                        END
                END,
                daily_surf_count = CASE
                    WHEN ? = 'surf' THEN
                        CASE
                            WHEN daily_limit_date = ? THEN LEAST(?, COALESCE(daily_surf_count, 0) + 1)
                            ELSE 1
                        END
                    ELSE
                        CASE
                            WHEN daily_limit_date = ? THEN COALESCE(daily_surf_count, 0)
                            ELSE 0
                        END
                END,
                daily_limit_date = ?
            WHERE phone = ?
            `,
            [today, type, today, maxDailyPosts, today, type, today, maxDailySurfs, today, today, phone]
        );

        const [rows]: any = await connection.execute(
            `
            SELECT
                CASE
                    WHEN daily_limit_date = ? THEN COALESCE(daily_run_count, 0)
                    ELSE 0
                END AS daily_run_count,
                CASE
                    WHEN daily_limit_date = ? THEN COALESCE(daily_post_count, 0)
                    ELSE 0
                END AS daily_post_count,
                CASE
                    WHEN daily_limit_date = ? THEN COALESCE(daily_surf_count, 0)
                    ELSE 0
                END AS daily_surf_count,
                daily_limit_date
            FROM user1
            WHERE phone = ?
            LIMIT 1
            `,
            [today, today, today, phone]
        );

        return rows?.[0] ?? null;
    } catch (e) {
        console.error(`Failed to update daily_${type}_count for`, phone, e);
        return null;
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
    claimToken?: string;
} | null> {
    const conn = await getConnection();
    try {
        const [rows]: any = await conn.execute(
            `SELECT v.id, v.source_url, v.video_url, v.local_path, v.caption, v.hashtags
             FROM crawled_videos1 v
             WHERE v.downloaded = 1
               AND v.local_path IS NOT NULL
               AND COALESCE(v.post_count, 0) < ?
             ORDER BY v.created_at ASC
             LIMIT 20`,
            [MAX_POSTS_PER_VIDEO]
        );
        if (!rows || rows.length === 0) {
            return null;
        }

        for (const row of rows as any[]) {
            const videoId = Number(row?.id);
            if (!Number.isFinite(videoId)) {
                continue;
            }

            const localPath = String(row?.local_path || "").trim();
            if (!localPath || !fs.existsSync(localPath)) {
                await resetQueuedVideoState(conn, videoId).catch(() => { });
                continue;
            }

            return { ...row };
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

        const [lockedRows]: any = await conn.execute(
            `SELECT id
             FROM crawled_videos1
             WHERE id = ?
             FOR UPDATE`,
            [videoId]
        );

        if (!Array.isArray(lockedRows) || lockedRows.length === 0) {
            await conn.rollback();
            return { localPath: null, fullyPosted: false };
        }

        await conn.execute(
            `UPDATE crawled_videos1
             SET post_count = GREATEST(COALESCE(post_count, 0), ?)
             WHERE id = ?`,
            [MAX_POSTS_PER_VIDEO, videoId]
        );

        const [rows]: any = await conn.execute(
            `SELECT local_path, post_count FROM crawled_videos1 WHERE id = ?`,
            [videoId]
        );
        const row = rows?.[0];
        const fullyPosted = row ? Number(row.post_count || 0) >= MAX_POSTS_PER_VIDEO : false;

        await conn.execute(
            fullyPosted && row?.local_path
                ? `UPDATE crawled_videos1
                   SET local_path = NULL,
                       downloaded = 0
                   WHERE id = ?`
                : `UPDATE crawled_videos1
                   SET downloaded = downloaded
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

export async function syncQueuedVideosWithLocalFiles(limit: number = 200): Promise<{
    scanned: number;
    missing: number;
    reset: number;
}> {
    const conn = await getConnection();
    try {
        const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
        const [rows]: any = await conn.execute(
            `SELECT id, local_path
             FROM crawled_videos1
             WHERE downloaded = 1
               AND local_path IS NOT NULL
               AND COALESCE(post_count, 0) < ?
             ORDER BY created_at ASC
             LIMIT ?`,
            [MAX_POSTS_PER_VIDEO, safeLimit]
        );

        let scanned = 0;
        let missing = 0;
        let reset = 0;

        for (const row of rows as any[]) {
            scanned++;
            const videoId = Number(row?.id);
            const localPath = String(row?.local_path || "").trim();
            const missingLocalFile = !localPath || !fs.existsSync(localPath);
            if (!Number.isFinite(videoId) || !missingLocalFile) {
                continue;
            }

            missing++;
            await resetQueuedVideoState(conn, videoId).catch(() => { });
            reset++;
        }

        return { scanned, missing, reset };
    } finally {
        await conn.end();
    }
}

export async function deleteVideoFromQueue(videoId: number, claimToken?: string | null): Promise<void> {
    const conn = await getConnection();
    try {
        await conn.execute(
            `UPDATE crawled_videos1
             SET local_path = NULL,
                 downloaded = 0
             WHERE id = ?`,
            [videoId]
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
            INNER JOIN user1 u ON u.phone = f.sender_phone
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
