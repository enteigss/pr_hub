import { Pool } from 'pg';

// Helper function for updating database when user logs in
export async function findOrCreateUser(
    githubId: number,
    githubUsername: string,
    avatarUrl: string,
    encryptedToken: string,
    pool: Pool
): Promise<number> {
    console.log(`Finding or creating user for githubId: ${githubId}`);

    const selectQuery = 'SELECT id FROM users WHERE github_id = $1';
    let userResult = await pool.query(selectQuery, [githubId]);
    let userId;

    if (userResult.rows.length > 0) {
        // Update info
        console.log("User found, updating token...");
        userId = userResult.rows[0].id;
        const updateQuery = 'UPDATE users SET access_token = $1, github_username = $2, avatar_url = $3, updated_at = NOW() WHERE id = $4';
        await pool.query(updateQuery, [encryptedToken, githubUsername, avatarUrl, userId]);
    } else {
        // Create new entry
        console.log("User not found, creating new user...");
        const insertQuery = 'INSERT INTO users (github_id, github_username, access_token, avatar_url, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING id';
        const insertResult = await pool.query(insertQuery, [githubId, githubUsername, encryptedToken, avatarUrl]);
        userId = insertResult.rows[0].id;
    }
    console.log(`User operation successful. App User ID: ${userId}`);
    return userId;
}
