import { NextRequest, NextResponse } from "next/server";

const GITHUB_API = "https://api.github.com";

async function fetchGitHub(url: string, token?: string | null) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) {
    headers.Authorization = `token ${token}`;
  }

  const res = await fetch(`${GITHUB_API}${url}`, { headers });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(
      `GitHub API error ${res.status}: ${error.message || res.statusText}`
    );
  }
  return res.json();
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const repo = searchParams.get("repo");
  const token = searchParams.get("token");

  if (!repo) {
    return NextResponse.json({ error: "repo is required" }, { status: 400 });
  }

  const parts = repo.split("/");
  if (parts.length !== 2) {
    return NextResponse.json(
      { error: "Invalid repo format. Use owner/repo" },
      { status: 400 }
    );
  }

  const [owner, repoName] = parts;

  try {
    // Fetch all 4 types in parallel
    const [commits, pulls, issues] = await Promise.all([
      fetchGitHub(
        `/repos/${owner}/${repoName}/commits?per_page=10`,
        token
      ),
      fetchGitHub(
        `/repos/${owner}/${repoName}/pulls?state=open&per_page=10`,
        token
      ),
      fetchGitHub(
        `/repos/${owner}/${repoName}/issues?state=open&per_page=10`,
        token
      ),
    ]);

    // Transform commits
    const commitMessages = commits.map((c: Record<string, unknown>) => {
      const commit = c.commit as Record<string, unknown>;
      const author = (c.author as Record<string, unknown>) || {};
      return {
        id: `commit-${c.sha}`,
        type: "commit" as const,
        repo,
        author: (author.login as string) || "unknown",
        title: (commit.message as string)?.split("\n")[0] || "Commit",
        detail: (commit.message as string) || "",
        timestamp: (commit.author as Record<string, unknown>)?.date
          ? new Date((commit.author as Record<string, unknown>).date as string).toLocaleDateString()
          : "",
        sha: c.sha,
      };
    });

    // Transform pull requests (include review requests)
    const prMessages = pulls.map((pr: Record<string, unknown>) => {
      const user = pr.user as Record<string, unknown>;
      const requestedReviewers = (pr.requested_reviewers as Record<string, unknown>[]) || [];
      const isReviewRequest = requestedReviewers.length > 0;

      return {
        id: `pr-${pr.number}`,
        type: isReviewRequest ? ("review_request" as const) : ("pull_request" as const),
        repo,
        author: (user.login as string) || "unknown",
        title: (pr.title as string) || "Pull Request",
        detail: (pr.body as string) || "",
        timestamp: pr.created_at
          ? new Date(pr.created_at as string).toLocaleDateString()
          : "",
        number: pr.number,
        requestedReviewers: requestedReviewers.map(
          (r) => (r as Record<string, unknown>).login
        ),
      };
    });

    // Transform issues (exclude PRs which also appear in issues)
    const issueMessages = issues
      .filter((issue: Record<string, unknown>) => !issue.pull_request)
      .map((issue: Record<string, unknown>) => {
        const user = issue.user as Record<string, unknown>;
        return {
          id: `issue-${issue.number}`,
          type: "issue" as const,
          repo,
          author: (user.login as string) || "unknown",
          title: (issue.title as string) || "Issue",
          detail: (issue.body as string) || "",
          timestamp: issue.created_at
            ? new Date(issue.created_at as string).toLocaleDateString()
            : "",
          number: issue.number,
        };
      });

    return NextResponse.json({
      messages: [...commitMessages, ...prMessages, ...issueMessages],
      repo: `${owner}/${repoName}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch from GitHub";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
