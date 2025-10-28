export interface GitHubUser {
    login: string; // GitHub username (needed for review matching)
    id: number; // Unique ID (never changes)
    avatarUrl: string; // Profile picture
    email: string | null; // Optional - useful for future features
}

interface GitHubReview {
    state: string;
    submittedAt: string;
    author: {
        login: string;
    } | null;
}

interface GitHubLabel {
    name: string;
}

interface GitHubCommit {
    commit: {
        committedDate: string;
    };
}

export interface GitHubPR {
    id: string;
    title: string;
    url: string;
    draft: boolean;
    created_at: string;
    updated_at: string;
    repository: {
        nameWithOwner: string;
    }
    author: GitHubUser;
    additions: number;
    deletions: number;
    changedFiles: number;
    reviews?: GitHubReview[];
    labels?: GitHubLabel[];
    commits?: GitHubCommit[];
    urgencyScore?: number;
    reason?: string;
}