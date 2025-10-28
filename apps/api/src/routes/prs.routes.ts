import { Router, Request, Response } from 'express';
import axios from 'axios';
import { Octokit } from "@octokit/rest";
import { pool } from '../config/database.js';
import { isAuthenticated } from '../middleware/auth.js';
import { prioritizePRs } from '../services/pr.service.js';
import { GitHubPR } from '@repo/shared-types';
import '../types/session.types.js';

const router = Router();

router.get('/', isAuthenticated, async (req: Request, res: Response) => {
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

        // GraphQL query to get PRs
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
        const reviewRequested = process.env.ENV === 'dev' ? 'gaearon' : githubLogin;
        const githubResponse: any = await octokit.graphql(
            GQL_QUERY,
            {
                queryString: `is:pr is:open review-requested:${reviewRequested} sort:created-desc`
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
        const filteredAndRankedPRs: GitHubPR[] = prioritizePRs(prs, githubLogin);
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

export default router;
