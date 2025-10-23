# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PR Hub is a monorepo application that provides a unified pull request inbox for GitHub users. It consists of two applications:
- **web**: Next.js 15 frontend with Tailwind CSS 4 and Turbopack
- **api**: Express.js backend with PostgreSQL for session management and data storage

## Architecture

### Monorepo Structure
This is an npm workspaces-based monorepo with two applications:
- `apps/web` - Next.js frontend (port 3000)
- `apps/api` - Express backend (port 5000)

### Authentication Flow
The application uses GitHub OAuth for authentication:
1. Frontend (`apps/web/src/app/page.tsx`) initiates login via `/api/auth/github/login`
2. Next.js rewrites `/api/*` requests to `http://localhost:5000/api/*` (see `apps/web/next.config.ts`)
3. Backend (`apps/api/src/server.js`) handles OAuth flow with state verification
4. Access tokens are encrypted and stored in PostgreSQL `users` table
5. Sessions are managed using `express-session` with `connect-pg-simple` (stored in `user_sessions` table)
6. After successful auth, user is redirected to `/dashboard`

### Database
PostgreSQL is used for:
- User storage (`users` table): github_id, github_username, access_token, avatar_url
- Session storage (`user_sessions` table): managed by connect-pg-simple
- Default connection: localhost:5433, database: pr_hub_db, user: pr_hub_user

Configuration is in `apps/api/src/server.js` lines 25-31, with environment variables in `apps/api/.env.local`.

### API Routes
Key backend routes (in `apps/api/src/server.js`):
- `/api/auth/github/login` - Initiates OAuth flow with state generation
- `/api/auth/github/callback` - Handles OAuth callback, exchanges code for token
- `/api/my-prs` - Protected route that fetches user's PRs from GitHub (requires authentication)

The `isAuthenticated` middleware (line 109) checks for `req.session.userId`.

### Frontend Pages
- `apps/web/src/app/page.tsx` - Landing page with GitHub login button
- `apps/web/src/app/dashboard/page.tsx` - Protected dashboard that displays user's PRs (fetches from `/api/my-prs`)

## Development Commands

### Starting Development Servers
```bash
# Run both web and api servers (recommended to run in separate terminals)
npm run dev:web   # Starts Next.js on port 3000 with Turbopack
npm run dev:api   # Starts Express server on port 5000

# Or run just the web app (default)
npm run dev
```

### Building and Testing
```bash
# Build the web application
npm run build              # Builds web workspace
npm run build --workspace=web

# Start production server
npm run start              # Starts production web server
npm run start --workspace=web

# Lint the codebase
npm run lint
```

### Workspace-Specific Commands
```bash
# Run commands in specific workspaces
npm run <script> --workspace=web
npm run <script> --workspace=api

# Example: lint just the web app
npm run lint --workspace=web
```

## Technical Details

### Next.js Configuration
- Uses Turbopack for faster builds (`--turbopack` flag in scripts)
- API proxy configured in `apps/web/next.config.ts` to forward `/api/*` to backend
- TypeScript path alias `@/*` maps to `./src/*` (root tsconfig.json)

### Express Backend
- Uses ES modules (`"type": "module"` in apps/api/package.json)
- CORS enabled for `http://localhost:3000`
- Session cookie: httpOnly, 24-hour maxAge, secure in production
- GitHub API integration via `@octokit/rest` for fetching PRs

### Environment Variables
Backend environment variables are in `apps/api/.env.local`:
- Database: `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT`
- GitHub OAuth: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI`
- Session: `SESSION_SECRET`
- App: `PORT`, `NODE_ENV`

## Key Dependencies

### Web (Next.js Frontend)
- Next.js 15.5.6 with Turbopack
- React 19
- Tailwind CSS 4 with PostCSS

### API (Express Backend)
- Express 5.1.0
- PostgreSQL via `pg` package
- `@octokit/rest` for GitHub API
- `express-session` + `connect-pg-simple` for session management
- `axios` for HTTP requests
- `cors` for cross-origin requests
