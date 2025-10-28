import { Request, Response, NextFunction } from 'express';
import '../types/session.types.js';

// Middleware to ensure user is logged in
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
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
