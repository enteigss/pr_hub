import { GitHubPR } from '@repo/shared-types';

// Helper function for calculating urgency score of PRs
export function calculateUrgencyScore(prData: GitHubPR, authenticatedUserGitHubLogin: string | undefined): { score: number; reason: string } {
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
    return { score: SCORE_DRAFT, reason: 'Draft or WIP PR' };
  }

  // --- 2. Check Explicit Urgency Markers (Highest Priority) ---
  const criticalKeywords = ['hotfix', 'critical', 'urgent', 'bugfix', 'fix:']; // Added colon for conventional commits
  const criticalLabels = ['critical', 'bug', 'p0', 'security', 'hotfix'];

  const titleLower = prData.title.toLowerCase();
  const matchedKeyword = criticalKeywords.find(keyword => titleLower.includes(keyword));
  const matchedLabel = prData.labels?.find(label => criticalLabels.includes(label.name.toLowerCase()));

  if (matchedKeyword || matchedLabel) {
    const reason = matchedLabel
      ? `Critical label: ${matchedLabel.name}`
      : `Critical keyword in title: ${matchedKeyword}`;
    return { score: SCORE_CRITICAL, reason };
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
      const hasNewerCommits = prData.commits.some(commit => new Date(commit.commit.committedDate).getTime() > reviewTimestamp);
      if (hasNewerCommits) {
        needsReReview = true;
      }
    }
  }
  if (needsReReview) {
    return { score: SCORE_RE_REVIEW, reason: 'New commits after you requested changes' };
  }

  // --- 4. Check for Staleness (Medium-High Priority) ---
  const hoursSinceCreation = (new Date().getTime() - new Date(prData.created_at).getTime()) / (1000 * 60 * 60);
  const hasReviews = prData.reviews && prData.reviews.length > 0; // Simplified check

  // Prioritize if > 24 hours old AND has no reviews yet
  if (hoursSinceCreation > 24 && !hasReviews) {
     return { score: SCORE_STALE, reason: `Stale PR (${Math.floor(hoursSinceCreation)} hours old with no reviews)` };
  }

  // --- 5. Check Size (Prioritize Small, Deprioritize Large) ---
  const totalLinesChanged = (prData.additions || 0) + (prData.deletions || 0);

  // If it hasn't hit higher priorities, consider size
  if (totalLinesChanged <= 100) { // Small PR - quick win (if relatively new)
      // Slightly boost newer small PRs, give stale ones precedence
      if (hoursSinceCreation <= 24 && !hasReviews) {
          return { score: SCORE_SMALL_NEW, reason: `Small PR (${totalLinesChanged} lines changed)` };
      }
  }
  if (totalLinesChanged > 500) { // Large PR - lower priority
     return { score: SCORE_LARGE, reason: `Large PR (${totalLinesChanged} lines changed)` };
  }

  // --- 6. Default Score (Normal Priority) ---
  return { score: SCORE_NORMAL, reason: 'Normal priority' };
}

// Helper function to get urgency score for all PRs
export function prioritizePRs(fetchedPRs: GitHubPR[], authenticatedUserGitHubLogin: string | undefined): GitHubPR[] {
  const scoredPRs = fetchedPRs.map(pr => {
    const { score, reason } = calculateUrgencyScore(pr, authenticatedUserGitHubLogin);
    return { ...pr, urgencyScore: score, reason };
  });

  // Sort PRs by score, descending (highest priority first)
  scoredPRs.sort((a, b) => b.urgencyScore! - a.urgencyScore!);

  return scoredPRs;
}
