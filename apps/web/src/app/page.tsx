'use client';
import React from 'react';

export default function Home() {

  const handleGitHubLogin = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    console.log("Redirecting browser to backend login endpoint.");
    window.location.href = `${apiUrl}/api/auth/github/login`;
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      textAlign: 'center',
      padding: '2rem',
      fontFamily: 'sans-serif',
    }}>

      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
        Your Unified Pull Request Inbox
      </h1>

      <p style={{ maxWidth: '400px', marginBottom: '2rem', color: '#555' }}>
        Connect your GitHub account to see all pending pull requests that need your review in one prioritized list.
      </p>

      <button
        onClick={handleGitHubLogin}
        style={{
          padding: '0.75rem 1.5rem',
          fontSize: '1rem',
          cursor: 'pointer',
          backgroundColor: '#24292e',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        Login with GitHub
      </button>

    </div>
  )
}
