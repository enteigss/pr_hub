// Load env variables
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Imports
import express from 'express';
import cors from 'cors';
import './types/session.types.js';
import './config/database.js'; // Initialize database connection
import { sessionMiddleware } from './middleware/session.js';
import indexRouter from './routes/index.js';
import authRouter from './routes/auth.routes.js';
import prsRouter from './routes/prs.routes.js';

// Create app instance
const app = express();

// CORS middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));

// Session middleware
app.use(sessionMiddleware);

// Mount routes
app.use('/', indexRouter);
app.use('/api/auth/github', authRouter);
app.use('/api/my-prs', prsRouter);

// Define port
const PORT = process.env.PORT || 5000;

// Start app
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
