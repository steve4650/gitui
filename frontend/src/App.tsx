import { useEffect, useState } from "react";
import "./App.css";
import StatusPanel from "./components/StatusPanel";
import GitGraphSVG, { useMaxCol } from "./components/GitGraph";

type Commit = {
  sha: string;
  message: string;
  author_name: string;
  author_email: string;
  commit_time: string;
  parents: string[];
  refs: string[];
  graph_column: number;
};

type CommitDiff = Commit & {
  patch: string;
};

function GitGraphOverlay({
  commits,
  selectedCommit,
  onSelect,
}: {
  commits: Commit[];
  selectedCommit: string | null;
  onSelect: (sha: string) => void;
}) {
  const maxCol = useMaxCol(commits);

  return (
    <div className="git-graph-overlay">
      <GitGraphSVG commits={commits} maxCol={maxCol} />
      <div className="commit-list">
        {commits.map((commit) => (
          <button
            key={commit.sha}
            className={`commit-button ${commit.sha === selectedCommit ? "selected" : ""}`}
            onClick={() => onSelect(commit.sha)}
          >
            <p className="commit-message">
              {commit.refs.length ? (
                <span className="commit-refs">
                  {commit.refs.map((ref) => (
                    <span
                      key={ref}
                      className={`commit-ref ${ref.startsWith("HEAD") ? "ref-head" : ref.startsWith("origin") ? "ref-remote" : "ref-branch"}`}
                    >
                      {ref}
                    </span>
                  ))}{" "}
                </span>
              ) : null}
              <span className="commit-hash">{commit.sha.slice(0, 7)}</span> {commit.message}
            </p>
            <p className="commit-meta">
              {commit.author_name} · {new Date(commit.commit_time).toLocaleString()}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [diff, setDiff] = useState<CommitDiff | null>(null);
  const [loadingCommits, setLoadingCommits] = useState(true);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setCurrentBranch] = useState<string | null>(null);
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem("theme") || "dark";
    } catch {
      return "dark";
    }
  });

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
        setCurrentBranch(body.current_branch ?? null);
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
    document.body.classList.toggle("light", theme === "light");
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }

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
        <div className="toolbar">
          <div />
          <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "light" ? "☀️" : "🌙"}
          </button>
        </div>
        <StatusPanel
          onRefresh={() => {
            /* refresh commits after status change */
            (async () => {
              setLoadingCommits(true);
              try {
                const res = await fetch("/api/commits");
                if (res.ok) {
                  const body = await res.json();
                  setCommits(body.commits ?? []);
                  setCurrentBranch(body.current_branch ?? null);
                }
              } catch {}
              setLoadingCommits(false);
            })();
          }}
          onShowDiff={(patch: string, title: string) => {
            setDiff({
              sha: "",
              message: title,
              author_name: "",
              author_email: "",
              commit_time: new Date().toISOString(),
              parents: [],
              refs: [],
              graph_column: 0,
              patch,
            });
          }}
        />
        <h1>Commit history</h1>
        {loadingCommits && <p className="loading">Loading commits...</p>}
        {error && <p className="loading">{error}</p>}
        <GitGraphOverlay
          commits={commits}
          selectedCommit={selectedCommit}
          onSelect={setSelectedCommit}
        />
      </aside>
      <main className="main">
        {loadingDiff && <p className="loading">Loading patch...</p>}
        {diff ? (
          <div>
            <div className="commit-meta">
              <strong>
                <span className="commit-hash">{diff.sha.slice(0, 7)}</span> {diff.message}
              </strong>
              <p>
                {diff.author_name ?? ""} ·{" "}
                {diff.commit_time ? new Date(diff.commit_time).toLocaleString() : ""}
              </p>
            </div>
            <div className="commit-diff" aria-live="polite">
              {diff.patch.split("\n").map((line, idx) => {
                const isAdded = line.startsWith("+");
                const isRemoved = line.startsWith("-");
                const isHunk = line.startsWith("@@");
                const className = isAdded
                  ? "diff-line added"
                  : isRemoved
                    ? "diff-line removed"
                    : isHunk
                      ? "diff-line hunk"
                      : "diff-line";
                // keep empty lines visible
                const content = line === "" ? "\u00A0" : line;
                return (
                  <div key={idx} className={className}>
                    {content}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          !loadingDiff && <p className="loading">Select a commit to view its diff.</p>
        )}
      </main>
    </div>
  );
}

export default App;
