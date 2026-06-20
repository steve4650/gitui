import React, {useEffect, useState} from "react";

type Props = {
  onRefresh: () => void;
};

export default function StatusPanel({onRefresh}: Props) {
  const [staged, setStaged] = useState<string[]>([]);
  const [unstaged, setUnstaged] = useState<string[]>([]);
  const [branch, setBranch] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function toggleStage(path: string, action: "add" | "remove") {
    const res = await fetch("/api/stage", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({path, action}),
    });
    if (res.ok) {
      await loadStatus();
      onRefresh();
    } else {
      setError(`Failed to ${action} ${path}`);
    }
  }

  async function commitStaged() {
    if (!staged.length) return;
    const message = window.prompt("Commit message", "");
    if (!message) return;
    const res = await fetch("/api/commit", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({message}),
    });
    if (res.ok) {
      await loadStatus();
      onRefresh();
    } else {
      setError("Failed to create commit");
    }
  }

  return (
    <div>
      <div style={{padding: "6px 8px"}}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
          <strong>branch: {branch ?? "-"}</strong>
          <div style={{display: "flex", gap: 8}}>
            {staged.length > 0 && (
              <button className="theme-toggle" onClick={commitStaged} title="Commit staged changes">Commit</button>
            )}
          </div>
        </div>
      </div>

      {loading && <p className="loading">Loading status...</p>}
      {error && <p className="loading">{error}</p>}

      {/* Unstaged first: compact list items */}
      {unstaged.length > 0 && (
        <div>
          <h2 style={{margin: "6px 8px"}}>Unstaged Changes</h2>
          <ul style={{listStyle: "none", padding: "6px 12px", margin: 0}}>
            {unstaged.map((p) => (
              <li key={p} style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: "0.88rem"}}>
                <div style={{color: "#cbd5e1"}}>{p}</div>
                <div>
                  <button onClick={() => toggleStage(p, "add")} style={{marginLeft: 8}}>Stage</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Staged next: look like pseudo-commits */}
      {staged.length > 0 && (
        <div>
          <h2 style={{margin: "6px 8px"}}>Staged</h2>
          {staged.map((p) => (
            <div key={p} className="commit-button" style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
              <div>
                <p className="commit-message">{p}</p>
                <p className="commit-meta">staged</p>
              </div>
              <div>
                <button onClick={() => toggleStage(p, "remove")} style={{marginLeft: 8}}>Unstage</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
