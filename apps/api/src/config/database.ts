import { Pool } from 'pg';

// Configure database connection pool
export const pool = new Pool({
    user: process.env.DB_USER || 'pr_hub_user',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'pr_hub_db',
    password: process.env.DB_PASSWORD || 'suicune20',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5433,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Error connecting to PostgreSQL:', err);
    } else {
        console.log('Successfully connected to PostgreSQL.');
    }
});
