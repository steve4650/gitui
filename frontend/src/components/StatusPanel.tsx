import { useEffect, useState } from "react";
import CommitDialog from "./CommitDialog";

type Props = {
  onRefresh: () => void;
  onShowDiff: (patch: string, title: string) => void;
};

export default function StatusPanel({ onRefresh, onShowDiff }: Props) {
  const [staged, setStaged] = useState<{ path: string; type: string }[]>([]);
  const [unstaged, setUnstaged] = useState<{ path: string; type: string }[]>([]);
  const [branch, setBranch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCommitDialog, setShowCommitDialog] = useState(false);

  async function loadStatus() {
    setError(null);
    try {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = await res.json();
      setStaged(body.staged || []);
      setUnstaged(body.unstaged || []);
      setBranch(body.current_branch || null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  async function toggleStage(path: string, action: "add" | "remove") {
    const res = await fetch("/api/stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, action }),
    });
    if (res.ok) {
      await loadStatus();
      onRefresh();
    } else {
      setError(`Failed to ${action} ${path}`);
    }
  }

  async function discardFile(path: string) {
    await fetch("/api/discard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    await loadStatus();
    onRefresh();
  }

  async function stageAll() {
    await fetch("/api/stage-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add" }),
    });
    await loadStatus();
    onRefresh();
  }

  async function unstageAll() {
    await fetch("/api/stage-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove" }),
    });
    await loadStatus();
    onRefresh();
  }

  async function commitStaged() {
    if (!staged.length) return;
    setShowCommitDialog(true);
  }

  async function handleCommit(message: string) {
    setShowCommitDialog(false);
    const res = await fetch("/api/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (res.ok) {
      await loadStatus();
      onRefresh();
    } else {
      setError("Failed to create commit");
    }
  }

  async function handlePush() {
    setError(null);
    const res = await fetch("/api/push", { method: "POST" });
    if (res.ok) {
      onRefresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.reason || "Push failed");
    }
  }

  async function handlePull() {
    setError(null);
    const res = await fetch("/api/pull", { method: "POST" });
    if (res.ok) {
      await loadStatus();
      onRefresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.reason || "Pull failed");
    }
  }

  async function showFileDiff(scope: "staged" | "unstaged", path?: string) {
    const url = new URL("/api/diff", window.location.origin);
    url.searchParams.set("scope", scope);
    if (path) url.searchParams.set("path", path);
    const res = await fetch(url.toString());
    if (res.ok) {
      const body = await res.json();
      const title = path ? `${scope}: ${path}` : `${scope} changes`;
      onShowDiff(body.patch, title);
    } else {
      setError("Failed to load diff");
    }
  }

  return (
    <div>
      <CommitDialog
        open={showCommitDialog}
        onClose={() => setShowCommitDialog(false)}
        onSubmit={handleCommit}
      />
      <div style={{ padding: "6px 8px" }}>
        <strong>branch: {branch ?? "-"}</strong>
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          <button className="theme-toggle" onClick={handlePush} title="Push to remote">
            Push
          </button>
          <button className="theme-toggle" onClick={handlePull} title="Pull from remote">
            Pull
          </button>
          {staged.length > 0 && (
            <button className="theme-toggle" onClick={commitStaged} title="Commit staged changes">
              Commit
            </button>
          )}
        </div>
      </div>

      {error && <p className="loading">{error}</p>}

      {/* Unstaged first: compact list items */}
      {unstaged.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", margin: "4px 6px", gap: 4 }}>
            <h2 style={{ margin: 0, cursor: "pointer" }} onClick={() => showFileDiff("unstaged")}>
              Unstaged Changes
            </h2>
            <button onClick={stageAll} title="Stage all changes">
              Stage All
            </button>
          </div>
          <ul className="file-list">
            {unstaged.map((f) => (
              <li key={f.path} className="file-item">
                <span className="file-label" onClick={() => showFileDiff("unstaged", f.path)}>
                  <span className={"change-badge " + f.type}>{f.type[0].toUpperCase()}</span>
                  {f.path}
                </span>
                <div className="file-actions">
                  <button onClick={() => discardFile(f.path)} title="Discard changes">
                    ↩
                  </button>
                  <button onClick={() => toggleStage(f.path, "add")}>Stage</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Staged next: look like pseudo-commits */}
      {staged.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", margin: "4px 6px", gap: 4 }}>
            <h2 style={{ margin: 0, cursor: "pointer" }} onClick={() => showFileDiff("staged")}>
              Staged
            </h2>
            <button onClick={unstageAll} title="Unstage all changes">
              Unstage All
            </button>
          </div>
          <ul className="file-list">
            {staged.map((f) => (
              <li key={f.path} className="file-item staged">
                <span className="file-label" onClick={() => showFileDiff("staged", f.path)}>
                  <span className={"change-badge " + f.type}>{f.type[0].toUpperCase()}</span>
                  {f.path}
                </span>
                <button onClick={() => toggleStage(f.path, "remove")}>Unstage</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
