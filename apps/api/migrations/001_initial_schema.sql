-- Migration: Initial Schema
-- Description: Creates the users table for storing GitHub user data
-- Created: 2025-10-29

-- Users table
-- Stores authenticated GitHub users and their encrypted access tokens
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    github_id INTEGER UNIQUE NOT NULL,
    github_username VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on github_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
