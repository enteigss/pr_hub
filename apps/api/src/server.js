// /apps/api/src/server.js

// Load env variables
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Imports
import { Pool } from 'pg'; // PostgreSQL
import axios from 'axios';
import { Octokit } from "@octokit/rest";
import express from 'express';
import session from 'express-session';
import pgSessionImport from 'connect-pg-simple';
import crypto from 'crypto';
import cors from 'cors';

const pgSession = pgSessionImport(session);

// Configure database connection pool
const pool = new Pool({
    user: process.env.DB_USER || 'pr_hub_user',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'pr_hub_db',
    password: process.env.DB_PASSWORD || 'suicune20',
    port: process.env.DB_PORT || 5433,
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Error connecting to PostgreSQL:', err)
    } else {
        console.log('Successfully connected to PostreSQL.');
    }
})

// Create app instance
const app = express()

// Helper function to get GitHub user info
async function getGitHubUserInfo(token) {
    try {
        console.log("Fetching user info from GitHub...");
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        console.log("GitHub user info received:", userResponse.data.login);
        return userResponse.data;
    } catch (error) {
        console.error("Error fetching GitHub user info:", error.response?.data || error.message);
        throw new Error('Could not fetch user information from GitHub.');
    }
}  

// Helper function for updating database when user logs in
async function findOrCreateUser(githubId, githubUsername, avatarUrl, encryptedToken, pool) {
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
    return { id: userId };
}

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}))

// Session middleware configuration
app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'user_sessions'
    }),
    secret: process.env.SESSION_SECRET || 'secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// Middleware to ensure user is logged in
const isAuthenticated = (req, res, next) => {
    console.log('--------------------');
    console.log('[AUTH MIDDLEWARE] Received cookies:', req.cookies);
    console.log('[AUTH MIDDLEWARE] Session data:', req.session);

    if (req.session.userId) {
        console.log("User is logged in.");
        next();
    } else {
        console.log("User ID is undefined.");
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Routes
app.get('/', (req, res) => {
    res.send('Hello from the backend API!');
})

app.get('/api/my-prs', isAuthenticated, async (req, res) => {
    console.log("Received request to get user PRs.");

    try {
        // Get user from session
        const userId = req.session.userId;

        // Find user in database
        const userResult = await pool.query(
            'SELECT access_token FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get user's stored GitHub access token
        const accessToken = userResult.rows[0].access_token;

        // Need to get owner name, and repo name

        // Get data from GitHub
        const octokit = new Octokit({ auth: accessToken });
        const githubResponse = await octokit.request('GET /search/issues', {
            q: 'is:pr is:open user:@me',
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        console.log("GitHub Response:", githubResponse);
        res.status(200).json({ prs: githubResponse.data.items });

    } catch (error) {
        console.error("Failed to get PRs from GitHub:", error);
        res.status(500).json({ error: 'Failed to fetch PRs from GitHub' });
    }
});

// GitHub OAuth Callback Route
app.get('/api/auth/github/callback', async (req, res) => {
    // Callback logic
    console.log("Received callback from GitHub!");

    // Get code and state from query parameters
    const code = req.query.code;
    const returnedState = req.query.state;
    const originalState = req.session.oauth_state;

    console.log("Received Code:", code);
    console.log("Received State:", returnedState);
    console.log("Original State (from session):", originalState);

    // Verify state
    if (!originalState | !returnedState | originalState !== returnedState) {
        console.error('State mismatch or missing state!');
        // Clear compromised session state
        if (req.session) {
            req.session.destroy();
        }
        return res.status(403).send('Invalid state parameter. Possible CSRF attack.');
    }

    delete req.session.oauth_state;

    // return res.send('Success!');

    // Exchange authorization code for access tokens
    try {
        const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Ov23ctAkZYibG05rDDT8';
        const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '09e7e2aef9d6133a8d82ef0e0295f6058452abce';
        const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || 'http://localhost:5000/api/auth/github/callback';

        // Prepare request data
        const tokenUrl = 'https://github.com/login/oauth/access_token';
        const requestData = {
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code: code,
            redirect_uri: GITHUB_REDIRECT_URI,
        };

        const requestConfig = {
            headers: {
                'Accept': 'application/json'
            }
        };

        console.log("Exchanging code for token...");

        // Make POST request
        const response = await axios.post(tokenUrl, requestData, requestConfig);

        // Process success
        const accessToken = response.data.access_token;
        const scope = response.data.scope;
        const tokenType = response.data.token_type;

        if (!accessToken) {
            console.error("Error: Access token not found in Github's response", response.data);
            throw new Error('Failed to retrieve access token from Github.');
        }

        console.log("Successfully obtained access token!");
        console.log("Access Token:", accessToken);
        console.log("Scope:", scope);
        console.log("Token Type:", tokenType);

        // Get user info using access tokens
        const githubUser = await getGitHubUserInfo(accessToken);
        const githubId = githubUser.id;
        const githubUsername = githubUser.id;
        const avatarUrl = githubUser.avatar_url;

        // Update or create new user in database
        const appUser = await findOrCreateUser(githubId, githubUsername, avatarUrl, accessToken, pool);

        // Regenerate session and add user ID to new session
        console.log("Regenerating session and storing user ID...");
        req.session.regenerate((regenErr) => {
        if (regenErr) {
            console.error("Error regenerating session:", regenErr);
            // Handle error appropriately - maybe redirect to an error page
            return res.status(500).send('Session regeneration failed.');
        }

        // Store your application's user ID in the new session
        req.session.userId = appUser.id; // Store the ID from YOUR users table
        console.log(`Stored appUser.id (${appUser.id}) in new session: ${req.session}`);


        // Save the regenerated session before redirecting
        req.session.save((saveErr) => {
            if (saveErr) {
            console.error("Error saving regenerated session:", saveErr);
            return res.status(500).send('Failed to save session after login.');
            }

            console.log("Regenerated session saved. Redirecting to frontend...");
            res.redirect('http://localhost:3000/dashboard');
        });
    });

    } catch (error) {
        // Handle errors
        console.error("Error during token exchange:", error.message);

        if (error.response) {
            console.error("GitHub Error Response Status:", error.response.status);
            console.error("GitHub Error Response Data:", error.response.data);
        } else if (error.request) {
            console.error("Error: No response received from GitHub token endpoint.");
        }

        // Destroy session if token exchange failed
        if (req.session) {
            req.session.destroy((destroyErr) => {
                if (destroyError) console.error("Error destroying session after token exchange error:", destroyErr);
            });
        }
        res.status(500).send('Authentication failed: Could not exchange code for token.');
    }
})

// GitHub Login Route
app.get('/api/auth/github/login', async (req, res) => {
    // GitHub Login API for generating and storing state 
    console.log("GitHub Login API Called!");

    // Generate state
    const state = crypto.randomUUID();

    // Store state in server-side session
    req.session.oauth_state = state;
    req.session.save((err) => {
        if (err) {
            console.error('Error saving session:', err);
            return res.status(500).send('Error initiating login');
        }

        const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Ov23ctAkZYibG05rDDT8';
        const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || 'http://localhost:5000/api/auth/github/callback';

        console.log("GITHUB_CLIENT_ID:", GITHUB_CLIENT_ID);


        if (!GITHUB_CLIENT_ID || !GITHUB_REDIRECT_URI) {
            console.error('Missing GitHub OAuth environment variables!');
            // Handle error 
             return;
        }

        const params = new URLSearchParams({
            client_id: GITHUB_CLIENT_ID,
            redirect_uri: GITHUB_REDIRECT_URI,
            scope: 'repo read:user',
            state: state,
        });

        const authorizeUrl = `https://github.com/login/oauth/authorize/?${params.toString()}`;
        res.redirect(authorizeUrl);
    });
});

// Define port
const PORT = process.env.PORT || 5000;

// Start app
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
})