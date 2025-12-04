# PR Hub - Unified Pull Request Inbox

A full-stack application that consolidates all your GitHub pull requests into a single, prioritized dashboard. Built to solve the problem of managing code reviews across multiple repositories.

## Problem Statement

Developers and code reviewers face multiple challenges when managing pull requests across projects:

**Context Switching & Fragmentation**
- Pull requests are scattered across multiple repositories and organizations
- Constant tab-switching between different GitHub pages breaks flow state
- No centralized view of all pending work

**Prioritization & Decision Paralysis**
- Difficult to identify which PRs need attention most urgently
- No clear signals about blocking PRs vs. nice-to-review items
- Time-sensitive reviews get buried among routine updates
- Hard to distinguish between critical hotfixes and feature work

**Signal vs. Noise**
- GitHub notifications mix PRs with comments, mentions, and CI updates
- Important review requests drown in notification overload
- No way to filter or rank PRs by actual impact or urgency

## Solution

PR Hub provides a **unified pull request inbox** that brings all your PRs into one clean, focused interface. By integrating directly with GitHub's API, it solves these problems by:

**Centralized View**
- Aggregates PRs across all repositories and organizations you have access to
- Single dashboard eliminates context switching between repos
- See both PRs you authored and PRs requesting your review

**Smart Prioritization**
- Displays time-sensitive information (PR age, draft status) at a glance
- Visual indicators help identify what needs urgent attention
- Priority reason field explains why each PR is important
- Clear separation between active work and draft PRs

**Signal Over Noise**
- Focused, distraction-free UI shows only pull requests
- No CI notifications, comments, or unrelated GitHub activity
- Clean interface designed for quick decision-making about what to work on next

## Key Features

- **GitHub OAuth Integration**: Secure authentication with your GitHub account
- **Unified Dashboard**: See all your PRs across all repositories in one place
- **Smart Prioritization**: Visual indicators for draft status and time-sensitive PRs
- **Real-time Data**: Fetches current PR status directly from GitHub
- **Clean Interface**: Minimal, distraction-free UI focused on what matters

## Architecture

### Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS 4, TypeScript
- **Backend**: Express.js 5, Node.js
- **Database**: PostgreSQL
- **Authentication**: GitHub OAuth 2.0
- **API Integration**: GitHub REST API (via Octokit)

### Monorepo Structure

```
pr-hub-monorepo/
├── apps/
│   ├── web/          # Next.js frontend (port 3000)
│   └── api/          # Express backend (port 5000)
├── packages/
│   └── shared-types/ # Shared TypeScript types
└── package.json      # Workspace configuration
```

### Authentication Flow

```
User → Frontend (Next.js) → Backend (Express) → GitHub OAuth
  ↓
Login with GitHub
  ↓
Backend generates random state token (CSRF protection)
  ↓
State stored in session, sent to GitHub in OAuth URL
  ↓
GitHub redirects back with code + state
  ↓
Backend verifies state matches session (prevents CSRF attacks)
  ↓
Backend exchanges code for access token
  ↓
Token stored in PostgreSQL
  ↓
Session created (httpOnly cookie)
  ↓
User redirected to Dashboard
```

### Data Flow

1. **Session Management**: Sessions stored in PostgreSQL using `express-session` with `connect-pg-simple`
2. **Protected Routes**: Backend middleware validates session before serving PR data
3. **GitHub API Calls**: Backend uses access tokens to fetch PRs via Octokit
4. **Real-time Updates**: Frontend fetches fresh PR data on dashboard load

## Technical Highlights

### Security
- **OAuth 2.0 Flow**: Implements GitHub OAuth with state verification to prevent CSRF attacks
- **HttpOnly Cookies**: Session cookies are httpOnly and secure in production
- **Environment Isolation**: Sensitive credentials stored in `.env.local` files

### Modern Full-Stack Architecture
- **Type Safety**: Shared TypeScript types between frontend and backend via workspace packages
- **API Proxy Pattern**: Next.js rewrites `/api/*` requests to Express backend for seamless integration
- **Monorepo Organization**: npm workspaces for efficient dependency management and code sharing
- **Server Components**: Leverages Next.js 15 App Router with React Server Components

### Database Design
- **Persistent Sessions**: PostgreSQL-backed sessions survive server restarts
- **Efficient Storage**: Normalized schema with `users` and `user_sessions` tables
- **Connection Pooling**: PostgreSQL connection pooling for scalability

## Live Demo

**[Try PR Hub Live](https://pr-hub-frontend.vercel.app/)**

Experience the unified PR inbox firsthand - log in with your GitHub account to see all your pull requests in one place.

## Key Implementation Details

### Backend (`apps/api/src/server.js`)

- **OAuth Routes**: `/api/auth/github/login` and `/api/auth/github/callback`
- **Protected Endpoints**: `/api/my-prs` requires authenticated session
- **Middleware**: `isAuthenticated` checks for `req.session.userId`
- **Session Store**: PostgreSQL via `connect-pg-simple`

### Frontend

- **Landing Page** (`apps/web/src/app/page.tsx`): GitHub login button
- **Dashboard** (`apps/web/src/app/dashboard/page.tsx`): Displays PRs with metadata
- **API Proxy** (`apps/web/next.config.ts`): Rewrites for seamless API calls

### Shared Types (`packages/shared-types`)

TypeScript interfaces shared between frontend and backend for type safety:
- `GitHubPR`: Pull request data structure
- User session types
- API response types

## Future Enhancements

- **Advanced Filtering**: Filter by repository, status, review state
- **Notification System**: Email/Slack alerts for new PRs or review requests
- **Team Views**: Organization-wide PR dashboards for team leads
- **PR Analytics**: Insights on review times, merge rates, contributor activity
- **Review Workflow**: In-app code review capabilities
- **Mobile App**: Native iOS/Android applications
- **Webhooks**: Real-time PR updates via GitHub webhooks

## Lessons Learned

### Technical Challenges

1. **OAuth Flow Complexity**: Implementing secure state verification and token management required careful attention to security best practices
2. **Session Management**: Chose PostgreSQL-backed sessions over JWT for better security and session invalidation control
3. **CORS Configuration**: Properly configuring CORS between frontend and backend while maintaining security

### Architecture Decisions

- **Monorepo Structure**: Simplified code sharing and type safety, though added complexity in build configuration
- **Next.js Rewrites vs. Direct Calls**: Initially used rewrites, but switched to direct backend calls for better deployment flexibility
- **Token Storage**: Opted for database storage with encryption over client-side storage for enhanced security

## License

MIT

## Contact

Email: jordan.anderson.green@gmail.com

---

Built with passion to solve a real developer problem. Feedback and contributions welcome!
