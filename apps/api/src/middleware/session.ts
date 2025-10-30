import session from 'express-session';
import pgSessionImport from 'connect-pg-simple';
import { pool } from '../config/database.js';
import '../types/session.types.js';

const pgSession = pgSessionImport(session);

// Session middleware configuration
export const sessionMiddleware = session({
    store: new pgSession({
        pool: pool,
        tableName: 'user_sessions',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || 'secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
});
