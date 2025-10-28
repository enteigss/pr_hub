import axios from 'axios';
import { GitHubUser } from '@repo/shared-types';

// Helper function to get GitHub user info
export async function getGitHubUserInfo(token: string): Promise<GitHubUser> {
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
