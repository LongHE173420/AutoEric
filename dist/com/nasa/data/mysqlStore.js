"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.releaseVideoReservation = releaseVideoReservation;
exports.getAccountsBatchFromDb = getAccountsBatchFromDb;
exports.saveAppUserId = saveAppUserId;
exports.getUsersForFriendRequest = getUsersForFriendRequest;
exports.recordFriendRequest = recordFriendRequest;
exports.saveTokensToDb = saveTokensToDb;
exports.recordRunInDb = recordRunInDb;
exports.recordDailyPublishInDb = recordDailyPublishInDb;
exports.getNextVideoToPost = getNextVideoToPost;
exports.markVideoPosted = markVideoPosted;
exports.deleteVideoFromQueue = deleteVideoFromQueue;
exports.updateFriendRequestStatus = updateFriendRequestStatus;
const promise_1 = __importDefault(require("mysql2/promise"));
const crypto_1 = require("crypto");
const env_1 = require("../config/env");
function getLocalDateString() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const vnTime = new Date(utc + (3600000 * 7));
    return `${vnTime.getFullYear()}-${String(vnTime.getMonth() + 1).padStart(2, "0")}-${String(vnTime.getDate()).padStart(2, "0")}`;
}
async function getConnection() {
    return await promise_1.default.createConnection({
        host: env_1.ENV.DB_HOST,
        port: env_1.ENV.DB_PORT,
        user: env_1.ENV.DB_USER,
        password: env_1.ENV.DB_PASS,
        database: env_1.ENV.DB_NAME
    });
}
const MAX_POSTS_PER_VIDEO = 1;
async function releaseVideoReservation(videoId, claimToken) {
    if (typeof videoId !== "number" || !Number.isFinite(videoId) || !claimToken) {
        return;
    }
    const conn = await getConnection();
    try {
        await conn.execute(`UPDATE crawled_videos
             SET claim_token = NULL,
                 claim_by = NULL,
                 claim_expires_at = NULL
             WHERE id = ?
               AND claim_token = ?`, [videoId, claimToken]);
    }
    finally {
        await conn.end();
    }
}
async function getAccountsBatchFromDb(lastSeenId, limit) {
    const connection = await getConnection();
    try {
        const today = getLocalDateString();
        const maxDailyRuns = Math.max(1, env_1.ENV.ACCOUNT_DAILY_RUN_LIMIT);
        const [rows] = await connection.execute(`
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
            FROM users
            WHERE id > ?
              AND (
                    daily_limit_date IS NULL
                 OR daily_limit_date < ?
                 OR COALESCE(daily_run_count, 0) < ?
              )
            ORDER BY id ASC
            LIMIT ?
            `, [
            today,
            today,
            today,
            Math.max(0, Number(lastSeenId) || 0),
            today,
            maxDailyRuns,
            Math.max(1, Number(limit) || 1)
        ]);
        return rows;
    }
    finally {
        await connection.end();
    }
}
async function saveAppUserId(phone, appUserId) {
    const connection = await getConnection();
    try {
        await connection.execute("UPDATE users SET app_user_id = ? WHERE phone = ?", [appUserId, phone]);
    }
    catch (e) {
        console.error("Failed to save app_user_id for", phone, e.message);
    }
    finally {
        await connection.end();
    }
}
async function getUsersForFriendRequest(currentPhone, limit) {
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
        return rows;
    }
    finally {
        await connection.end();
    }
}
async function recordFriendRequest(senderPhone, receiverPhone, receiverId) {
    const connection = await getConnection();
    try {
        await connection.execute(`
            INSERT IGNORE INTO friend (sender_phone, receiver_phone, receiver_id, status)
            VALUES (?, ?, ?, 'PENDING')
            `, [senderPhone, receiverPhone, receiverId]);
    }
    catch (e) {
        console.error("Failed to record friend request", senderPhone, "->", receiverPhone, e.message);
    }
    finally {
        await connection.end();
    }
}
async function saveTokensToDb(phone, accessToken, refreshToken) {
    const connection = await getConnection();
    try {
        await connection.execute("UPDATE users SET accessToken = ?, refreshToken = ? WHERE phone = ?", [accessToken, refreshToken, phone]);
    }
    finally {
        await connection.end();
    }
}
async function recordRunInDb(phone) {
    const connection = await getConnection();
    try {
        const today = getLocalDateString();
        const maxDailyRuns = Math.max(1, env_1.ENV.ACCOUNT_DAILY_RUN_LIMIT);
        await connection.execute(`
            UPDATE users
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
            `, [today, maxDailyRuns, today, today, today, today, phone]);
    }
    catch (e) {
        console.error("Failed to update daily_run_count for", phone, e);
    }
    finally {
        await connection.end();
    }
}
async function recordDailyPublishInDb(phone, type) {
    const connection = await getConnection();
    try {
        const today = getLocalDateString();
        const maxDailyPosts = Math.max(0, env_1.ENV.ACCOUNT_DAILY_POST_LIMIT);
        const maxDailySurfs = Math.max(0, env_1.ENV.ACCOUNT_DAILY_SURF_LIMIT);
        await connection.execute(`
            UPDATE users
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
            `, [today, type, today, maxDailyPosts, today, type, today, maxDailySurfs, today, today, phone]);
        const [rows] = await connection.execute(`
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
            FROM users
            WHERE phone = ?
            LIMIT 1
            `, [today, today, today, phone]);
        return rows?.[0] ?? null;
    }
    catch (e) {
        console.error(`Failed to update daily_${type}_count for`, phone, e);
        return null;
    }
    finally {
        await connection.end();
    }
}
async function getNextVideoToPost(accountPhone) {
    const conn = await getConnection();
    try {
        const now = Date.now();
        const claimExpiresAt = now + Math.max(30000, env_1.ENV.VIDEO_CLAIM_TTL_MS);
        const [rows] = await conn.execute(`SELECT v.id, v.source_url, v.video_url, v.local_path, v.caption, v.hashtags
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
             LIMIT 20`, [MAX_POSTS_PER_VIDEO, now, accountPhone]);
        if (!rows || rows.length === 0) {
            return null;
        }
        for (const row of rows) {
            const videoId = Number(row?.id);
            if (!Number.isFinite(videoId)) {
                continue;
            }
            const claimToken = (0, crypto_1.randomUUID)();
            const [claimRes] = await conn.execute(`UPDATE crawled_videos
                 SET claim_token = ?,
                     claim_by = ?,
                     claim_expires_at = ?
                 WHERE id = ?
                   AND downloaded = 1
                   AND local_path IS NOT NULL
                   AND COALESCE(post_count, 0) < ?
                   AND (claim_expires_at IS NULL OR claim_expires_at < ?)`, [claimToken, accountPhone, claimExpiresAt, videoId, MAX_POSTS_PER_VIDEO, now]);
            if (Number(claimRes?.affectedRows || 0) > 0) {
                return { ...row, claimToken };
            }
        }
        return null;
    }
    finally {
        await conn.end();
    }
}
async function markVideoPosted(videoId, accountPhone, claimToken) {
    const conn = await getConnection();
    try {
        await conn.beginTransaction();
        if (claimToken) {
            const [claimRows] = await conn.execute(`SELECT id
                 FROM crawled_videos
                 WHERE id = ?
                   AND claim_token = ?
                 FOR UPDATE`, [videoId, claimToken]);
            if (!Array.isArray(claimRows) || claimRows.length === 0) {
                await conn.rollback();
                return { localPath: null, fullyPosted: false };
            }
        }
        const [insertRes] = await conn.execute(`INSERT IGNORE INTO video_post_log (video_id, account_phone) VALUES (?, ?)`, [videoId, accountPhone]);
        const inserted = Number(insertRes?.affectedRows || 0) > 0;
        if (inserted) {
            await conn.execute(`UPDATE crawled_videos SET post_count = COALESCE(post_count, 0) + 1 WHERE id = ?`, [videoId]);
        }
        const [rows] = await conn.execute(`SELECT local_path, post_count FROM crawled_videos WHERE id = ?`, [videoId]);
        const row = rows?.[0];
        const fullyPosted = row ? Number(row.post_count || 0) >= MAX_POSTS_PER_VIDEO : false;
        await conn.execute(fullyPosted && row?.local_path
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
                   WHERE id = ?`, [videoId]);
        await conn.commit();
        return { localPath: row?.local_path ?? null, fullyPosted };
    }
    catch (err) {
        try {
            await conn.rollback();
        }
        catch { }
        throw err;
    }
    finally {
        await conn.end();
    }
}
async function deleteVideoFromQueue(videoId, claimToken) {
    const conn = await getConnection();
    try {
        await conn.execute(`UPDATE crawled_videos
             SET local_path = NULL,
                 downloaded = 0,
                 claim_token = NULL,
                 claim_by = NULL,
                 claim_expires_at = NULL
             WHERE id = ?
               AND (? IS NULL OR claim_token = ?)`, [videoId, claimToken ?? null, claimToken ?? null]);
    }
    finally {
        await conn.end();
    }
}
async function updateFriendRequestStatus(senderId, receiverPhone, status) {
    const connection = await getConnection();
    try {
        await connection.execute(`
            UPDATE friend f
            INNER JOIN users u ON u.phone = f.sender_phone
            SET f.status = ?
            WHERE f.receiver_phone = ? AND u.app_user_id = ?
            `, [status, receiverPhone, senderId]);
    }
    catch (error) {
        console.error("Error updating friend request status:", error);
    }
    finally {
        await connection.end();
    }
}
