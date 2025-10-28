import { Router, Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { pool } from '../config/database.js';
import { getGitHubUserInfo } from '../services/github.service.js';
import { findOrCreateUser } from '../services/user.service.js';
import { GitHubUser } from '@repo/shared-types';
import '../types/session.types.js';

const router = Router();

// GitHub Login Route
router.get('/login', async (req: Request, res: Response) => {
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

        const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
        const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI;

        console.log("GITHUB_CLIENT_ID:", GITHUB_CLIENT_ID);

        if (!GITHUB_CLIENT_ID || !GITHUB_REDIRECT_URI) {
            console.error('Missing GitHub OAuth environment variables!');
            return res.status(500).send('Missing GitHub OAuth configuration');
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

// GitHub OAuth Callback Route
router.get('/callback', async (req: Request, res: Response) => {
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
    if (!originalState || !returnedState || originalState !== returnedState) {
        console.error('State mismatch or missing state!');
        // Clear compromised session state
        if (req.session) {
            req.session.destroy((err) => {
                if (err) console.error('Error destroying session:', err);
            });
        }
        return res.status(403).send('Invalid state parameter. Possible CSRF attack.');
    }

    delete req.session.oauth_state;

    // Exchange authorization code for access tokens
    try {
        const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
        const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
        const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI;

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
        const githubUser: GitHubUser = await getGitHubUserInfo(accessToken);
        const githubId = githubUser.id;
        const githubUsername = githubUser.login;
        const avatarUrl = githubUser.avatarUrl;

        // Update or create new user in database
        const userId = await findOrCreateUser(githubId, githubUsername, avatarUrl, accessToken, pool);

        // Regenerate session and add user ID to new session
        console.log("Regenerating session and storing user ID...");
        req.session.regenerate((regenErr) => {
            if (regenErr) {
                console.error("Error regenerating session:", regenErr);
                return res.status(500).send('Session regeneration failed.');
            }

            // Store your application's user ID in the new session
            req.session.userId = userId;
            req.session.githubUsername = githubUsername;
            req.session.githubId = githubId;
            console.log(`Stored appUser.id (${userId}) in new session: ${req.session}`);

            // Save the regenerated session before redirecting
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error("Error saving regenerated session:", saveErr);
                    return res.status(500).send('Failed to save session after login.');
                }

                console.log("Regenerated session saved. Redirecting to frontend...");
                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                res.redirect(`${frontendUrl}/dashboard`);
            });
        });

    } catch (error) {
        // Handle errors
        if (axios.isAxiosError(error)) {
            console.error("Error during token exchange");
            console.error("GitHub Error Response Status:", error.response?.status);
            console.error("GitHub Error Response Data:", error.response?.data);
            if (!error.response) {
                console.error("Error: No response received from GitHub token endpoint.");
            }
        } else {
            console.error("Unexpected error during token exchange:", error);
        }

        // Destroy session if token exchange failed
        if (req.session) {
            req.session.destroy((destroyErr) => {
                if (destroyErr) console.error("Error destroying session after token exchange error:", destroyErr);
            });
        }
        res.status(500).send('Authentication failed: Could not exchange code for token.');
    }
});

export default router;
