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
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import pgSessionImport from 'connect-pg-simple';
import crypto from 'crypto';
import cors from 'cors';
import { GitHubUser, GitHubPR } from '@repo/shared-types';

// Extend express-session types to include custom session properties
declare module 'express-session' {
    interface SessionData {
        userId: number;
        oauth_state: string;
        githubUsername: string;
        githubId: number;
    }
}

const pgSession = pgSessionImport(session);

// Configure database connection pool
const pool = new Pool({
    user: process.env.DB_USER || 'pr_hub_user',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'pr_hub_db',
    password: process.env.DB_PASSWORD || 'suicune20',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5433,
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

// Helper function for calculating urgency score of PRs
function calculateUrgencyScore(prData: GitHubPR, authenticatedUserGitHubLogin: string | undefined) {
  // --- Define Score Levels ---
  const SCORE_CRITICAL = 1000;
  const SCORE_RE_REVIEW = 900;
  const SCORE_STALE = 800;
  const SCORE_SMALL_NEW = 700;
  const SCORE_NORMAL = 500;
  const SCORE_LARGE = 300;
  const SCORE_DRAFT = 10;

  // --- 1. Check Draft Status (Lowest Priority) ---
  if (prData.draft || prData.title.toLowerCase().includes('[wip]')) {
    return SCORE_DRAFT;
  }

  // --- 2. Check Explicit Urgency Markers (Highest Priority) ---
  const criticalKeywords = ['hotfix', 'critical', 'urgent', 'bugfix', 'fix:']; // Added colon for conventional commits
  const criticalLabels = ['critical', 'bug', 'p0', 'security', 'hotfix'];

  const titleLower = prData.title.toLowerCase();
  if (criticalKeywords.some(keyword => titleLower.includes(keyword)) ||
      prData.labels?.some(label => criticalLabels.includes(label.name.toLowerCase()))) {
    return SCORE_CRITICAL;
  }

  // --- 3. Check for "Ready for Re-Review" (High Priority) ---
  // This requires looking through review and commit history
  let needsReReview = false;
  if (prData.reviews && prData.commits) {
    // Find the latest "CHANGES_REQUESTED" review *by the current user*
    const lastChangesRequestedReview = prData.reviews
      .filter(review => review.author?.login === authenticatedUserGitHubLogin && review.state === 'CHANGES_REQUESTED')
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];

    if (lastChangesRequestedReview) {
      // Check if there are any commits *after* that review
      const reviewTimestamp = new Date(lastChangesRequestedReview.submittedAt).getTime();
      const hasNewerCommits = prData.commits.some(commit => new Date(commit.commit.committedDate).getTime() > reviewTimestamp); // 
      if (hasNewerCommits) {
        needsReReview = true;
      }
    }
  }
  if (needsReReview) {
    return SCORE_RE_REVIEW;
  }

  // --- 4. Check for Staleness (Medium-High Priority) ---
  const hoursSinceCreation = (new Date().getTime() - new Date(prData.created_at).getTime()) / (1000 * 60 * 60);
  const hasReviews = prData.reviews && prData.reviews.length > 0; // Simplified check

  // Prioritize if > 24 hours old AND has no reviews yet
  if (hoursSinceCreation > 24 && !hasReviews) {
     return SCORE_STALE;
  }

  // --- 5. Check Size (Prioritize Small, Deprioritize Large) ---
  const totalLinesChanged = (prData.additions || 0) + (prData.deletions || 0);

  // If it hasn't hit higher priorities, consider size
  if (totalLinesChanged <= 100) { // Small PR - quick win (if relatively new)
      // Slightly boost newer small PRs, give stale ones precedence
      if (hoursSinceCreation <= 24 && !hasReviews) {
          return SCORE_SMALL_NEW;
      }
  }
  if (totalLinesChanged > 500) { // Large PR - lower priority
     return SCORE_LARGE;
  }

  // --- 6. Default Score (Normal Priority) ---
  return SCORE_NORMAL;
}


// Helper function to get get urgency score for all PRs
function prioritizePRs(fetchedPRs: GitHubPR[], authenticatedUserGitHubLogin: string | undefined): GitHubPR[] {
  const scoredPRs = fetchedPRs.map(pr => {
    // Note: You might need to fetch additional details (reviews, commits, size)
    // if they weren't included in the initial fetch.
    // const detailedPRData = await fetchFullPRDetails(pr.url); // Hypothetical function

    const score = calculateUrgencyScore(pr, authenticatedUserGitHubLogin);
    return { ...pr, urgencyScore: score };
  });

  // Sort PRs by score, descending (highest priority first)
  scoredPRs.sort((a, b) => b.urgencyScore - a.urgencyScore);

  return scoredPRs;
}



// Helper function to get GitHub user info
async function getGitHubUserInfo(token: number) {
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
        if (axios.isAxiosError(error)) {
            console.error("GitHub API Error:", error.response?.data);
        } else {
            console.error("Unexpected error:", error);
        }
        throw new Error('Could not fetch user information from GitHub.');
    }
}  

// Helper function for updating database when user logs in
async function findOrCreateUser(githubId: number, githubUsername: string, avatarUrl: string, encryptedToken: string, pool: Pool) {
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
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
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
app.get('/', (req: Request, res: Response) => {
    res.send('Hello from the backend API!');
})

app.get('/api/my-prs', isAuthenticated, async (req: Request, res: Response) => {
    console.log("Received request to get user PRs.");

    try {
        // Get user from session
        const userId = req.session.userId;
        const githubLogin = req.session.githubUsername;

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
        const GQL_QUERY = `
            query GetMyPRs($queryString: String!) {
                search(query: $queryString, type: ISSUE, first: 20) {
                    edges {
                        node {
                            ... on PullRequest {
                                id
                                title
                                url
                                draft: isDraft
                                created_at: createdAt
                                updated_at: updatedAt
                                repository {
                                    nameWithOwner
                                }
                                author {
                                    login
                                    avatarUrl
                                }

                                # --- V2 DATA (PR SIZE) ---
                                additions
                                deletions
                                changedFiles

                                # --- V2 DATA (REVIEW STATUS) ---
                                reviews(last: 5) {
                                    nodes {
                                        state
                                        submittedAt
                                        author {
                                            login
                                        }
                                    }
                                }

                                # --- V2 DATA (LABELS) ---
                                labels(first: 10) {
                                    nodes {
                                        name
                                    }
                                }

                                # --- V2 DATA (COMMITS) ---
                                commits(last: 20) {
                                    nodes {
                                        commit {
                                            committedDate
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        // Get data from GitHub
        const octokit = new Octokit({ auth: accessToken });
        const githubResponse: any = await octokit.graphql(
            GQL_QUERY,
            {
                queryString: "is:pr is:open review-requested:gaearon"
            }
        );

        console.log("GitHub Response:", JSON.stringify(githubResponse, null, 2));
        const prs: GitHubPR[] = githubResponse.search.edges.map((edge: any) => {
            const node = edge.node;
            return {
                ...node,
                labels: node.labels?.nodes || [],
                reviews: node.reviews?.nodes || [],
                commits: node.commits?.nodes || []
            };
        });
        const filteredAndRankedPRs: GitHubPR[] = prioritizePRs(prs, githubLogin)
        res.status(200).json({ prs: filteredAndRankedPRs });

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error("GitHub API Error:", error.response?.data);
        } else {
            console.error("Failed to get PRs from GitHub:", error);
        }
        res.status(500).json({ error: 'Failed to fetch PRs from GitHub' });
    }
});

// GitHub OAuth Callback Route
app.get('/api/auth/github/callback', async (req: Request, res: Response) => {
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
            // Handle error appropriately - maybe redirect to an error page
            return res.status(500).send('Session regeneration failed.');
        }

        // Store your application's user ID in the new session
        req.session.userId = userId; // Store the ID from YOUR users table
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
            res.redirect('http://localhost:3000/dashboard');
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
})

// GitHub Login Route
app.get('/api/auth/github/login', async (req: Request, res: Response) => {
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