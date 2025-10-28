// Extend express-session types to include custom session properties
declare module 'express-session' {
    interface SessionData {
        userId: number;
        oauth_state: string;
        githubUsername: string;
        githubId: number;
    }
}

export {};
