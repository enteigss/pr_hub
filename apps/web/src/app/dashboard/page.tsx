'use client';

import React from 'react';
import { useEffect, useState } from 'react';

interface PullRequest {
    id: number;
    title: string;
    html_url: string;
    user: {
        login: string;
        avatar_url: string;
    };
    repository_url: string;
    created_at: string;
    draft: boolean;
}

// Helper function to show "X days ago"
function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  let interval = seconds / 31536000; // years
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000; // months
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400; // days
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600; // hours
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60; // minutes
  if (interval > 1) return Math.floor(interval) + " minutes ago";
  return Math.floor(seconds) + " seconds ago";
}

// Helper function to extract "owner/repo" from repository_url
function getRepoName(url: string) {
    try {
        const parts = new URL(url).pathname.split('/');
        return `${parts[2]}/${parts[3]}`;
    } catch (e) {
        return url;
    }
}

export default function DashboardPage() {
    const [prs, setPrs] = useState<PullRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchPullRequests() {
            try {
                const response = await fetch('/api/my-prs', {
                    credentials: 'include'
                });
                if (!response.ok) {
                    console.error("Failed to get Pull Requests from backend.");
                    throw new Error("Not authorized. Please log in.");
                }

                const data = await response.json();
                console.log("Raw data from /api/my-prs:", data);
                setPrs(data.prs);
            } catch (error) {
                setError(error.message);
            } finally {
                setIsLoading(false);
            }
        }

        fetchPullRequests();
    }, [])

    if (isLoading) {
        return <div>Loading your PRs...</div>
    }

    if (error) {
        return <div>Error: {error}</div>
    }

    // Load user's PRs
    return (
        <main className="max-w-2xl mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4 text-center">Your Pull Requests</h1>
            <div className="flex flex-col gap-3">
                {prs.map((pr) => (
                    // PR Card
                    <div key={pr.id}
                    // Gray out draft PRs
                    className={`flex items-start gap-4 p-4 bg-white border rounded-lg shadow-sm
                    ${pr.draft ? 'opacity-60' : ''}`}
                    >
                        {/* Column 1: Avatar */}
                        <img 
                            src={pr.user.avatar_url}
                            alt={pr.user.login}
                            className="w-10 h-10 rounded-full"
                        />

                        {/* Column 2: PR Info */}
                        <div className="flex-1">

                            {/* Repo name + Draft Badge */}
                            <div className='flex justify-between items-center'>
                                <p className="text-sm text-gray-500">
                                    {getRepoName(pr.repository_url)}
                                </p>
                                {pr.draft && (
                                    <span className="px-2 py-0.5 text-xs font-semibold text-gray-700 bg-gray-200 rounded-full">
                                        Draft
                                    </span>
                                )}
                            </div>
                        </div>
                        <a
                            href={pr.html_url}
                            className="text-lg font-semibold text-blue-600 hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {pr.title}
                        </a>

                        {/* Author + Date (meta info) */}
                        <p className="text-sm text-gray-500 mt-1">
                            Authored by <span className="font-medium text-gray-700">{pr.user.login}</span>
                            <span> &bull; {timeAgo(pr.created_at)} </span>
                        </p>
                    </div>
                ))}
            </div>
        </main>
    );
}