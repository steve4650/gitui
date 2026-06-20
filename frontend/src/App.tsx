import { useEffect, useState } from "react";
import "./App.css";

type Commit = {
  sha: string;
  message: string;
  author_name: string;
  author_email: string;
  commit_time: string;
  parents: string[];
};

type CommitDiff = Commit & {
  patch: string;
};

function App() {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [diff, setDiff] = useState<CommitDiff | null>(null);
  const [loadingCommits, setLoadingCommits] = useState(true);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCommits() {
      setLoadingCommits(true);
      setError(null);
      try {
        const response = await fetch("/api/commits");
        if (!response.ok) {
          throw new Error(`Failed to load commits: ${response.status}`);
        }
        const body = await response.json();
        setCommits(body.commits ?? []);
        if (body.commits?.length) {
          setSelectedCommit(body.commits[0].sha);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoadingCommits(false);
      }
    }

    loadCommits();
  }, []);

  useEffect(() => {
    if (!selectedCommit) {
      setDiff(null);
      return;
    }

    async function loadDiff() {
      setLoadingDiff(true);
      setError(null);
      try {
        const response = await fetch(`/api/commit/${selectedCommit}`);
        if (!response.ok) {
          throw new Error(`Failed to load diff: ${response.status}`);
        }
        const body = await response.json();
        setDiff(body);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoadingDiff(false);
      }
    }

    loadDiff();
  }, [selectedCommit]);

  return (
    <div id="app">
      <aside className="sidebar">
        <h1>Commit history</h1>
        {loadingCommits && <p className="loading">Loading commits...</p>}
        {error && <p className="loading">{error}</p>}
        {commits.map((commit) => (
          <button
            key={commit.sha}
            className={`commit-button ${commit.sha === selectedCommit ? "selected" : ""}`}
            onClick={() => setSelectedCommit(commit.sha)}
          >
            <p className="commit-message">{commit.message}</p>
            <p className="commit-meta">
              {commit.author_name} · {new Date(commit.commit_time).toLocaleString()}
            </p>
          </button>
        ))}
      </aside>
      <main className="main">
        <h1>Diff viewer</h1>
        {loadingDiff && <p className="loading">Loading patch...</p>}
        {diff ? (
          <div>
            <div className="commit-meta">
              <strong>{diff.message}</strong>
              <p>
                {diff.author_name} · {new Date(diff.commit_time).toLocaleString()}
              </p>
            </div>
            <pre className="commit-diff">{diff.patch}</pre>
          </div>
        ) : (
          !loadingDiff && <p className="loading">Select a commit to view its diff.</p>
        )}
      </main>
    </div>
  );
}

export default App;
