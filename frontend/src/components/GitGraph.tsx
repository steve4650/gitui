import { useMemo } from "react";

export const ROW_H = 52;
const COL_W = 18;
const PAD_X = 8;
const DOT_R = 5;

type Commit = {
  sha: string;
  graph_column: number;
  parents: string[];
  refs?: string[];
};

type GraphProps = {
  commit: Commit;
  commits: Commit[];
  maxCol: number;
};

export default function GitGraphRow({ commit, commits, maxCol }: GraphProps) {
  const shaIndex = useMemo(() => {
    const m = new Map<string, number>();
    commits.forEach((c, i) => m.set(c.sha, i));
    return m;
  }, [commits]);

  const svgWidth = maxCol * COL_W + PAD_X * 2 + COL_W;
  const x = PAD_X + commit.graph_column * COL_W;
  const centerY = ROW_H / 2;
  const isHead = commit.refs?.some((r: string) => r.startsWith("HEAD"));

  return (
    <svg width={svgWidth} height={ROW_H} className="git-graph-cell" aria-hidden>
      {/* Top half of vertical line (connection from previous row) */}
      <line x1={x} y1={0} x2={x} y2={centerY} stroke="#808080" strokeWidth={2} />

      {/* Bottom half of vertical line (connection to next row) */}
      <line x1={x} y1={centerY} x2={x} y2={ROW_H} stroke="#808080" strokeWidth={2} />

      {/* Lines to parents in different columns */}
      {(commit.parents || []).map((parentSha) => {
        const pi = shaIndex.get(parentSha);
        if (pi === undefined) return null;
        const parent = commits[pi];
        if (parent.graph_column === commit.graph_column) return null;
        const px = PAD_X + parent.graph_column * COL_W;

        return (
          <line
            key={parentSha}
            x1={px}
            y1={centerY}
            x2={x}
            y2={centerY}
            stroke="#808080"
            strokeWidth={2}
          />
        );
      })}

      {/* The commit dot */}
      <circle
        cx={x}
        cy={centerY}
        r={DOT_R}
        fill={isHead ? "#000080" : "#c0c0c0"}
        stroke="#808080"
        strokeWidth={1.5}
      />

      {/* Highlight ring for HEAD */}
      {isHead && (
        <circle cx={x} cy={centerY} r={DOT_R + 3} fill="none" stroke="#000080" strokeWidth={1.5} />
      )}
    </svg>
  );
}

export function useMaxCol(commits: Commit[]) {
  return useMemo(() => commits.reduce((m, c) => Math.max(m, c.graph_column), 0), [commits]);
}
