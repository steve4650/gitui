import { useMemo } from "react";

export const ROW_H = 52;
export const ROW_GAP = 2;
const COL_W = 14;
const PAD_X = 8;
const DOT_R = 5;

export type Commit = {
  sha: string;
  graph_column: number;
  parents: string[];
  refs?: string[];
};

export function useMaxCol(commits: Commit[]) {
  return useMemo(() => commits.reduce((m, c) => Math.max(m, c.graph_column), 0), [commits]);
}

export default function GitGraphSVG({ commits, maxCol }: { commits: Commit[]; maxCol: number }) {
  const shaIdx = useMemo(() => {
    const m = new Map<string, number>();
    commits.forEach((c, i) => m.set(c.sha, i));
    return m;
  }, [commits]);

  const svgWidth = (maxCol + 1) * COL_W + PAD_X * 2;
  const rowStep = ROW_H + ROW_GAP;
  const totalHeight = commits.length * ROW_H + (commits.length - 1) * ROW_GAP;

  function cx(col: number) {
    return PAD_X + col * COL_W;
  }
  function cy(index: number) {
    return index * rowStep + ROW_H / 2;
  }

  if (!commits.length) return null;

  return (
    <svg width={svgWidth} height={totalHeight} className="git-graph-svg" aria-hidden>
      {commits.map((commit, i) => {
        const x = cx(commit.graph_column);
        const y = cy(i);

        return commit.parents.map((parentSha) => {
          const pi = shaIdx.get(parentSha);
          if (pi === undefined) return null;
          const parent = commits[pi];
          return (
            <line
              key={`${commit.sha}-${parentSha}`}
              x1={x}
              y1={y}
              x2={cx(parent.graph_column)}
              y2={cy(pi)}
              stroke="#808080"
              strokeWidth={2}
            />
          );
        });
      })}

      {commits.map((commit, i) => {
        const x = cx(commit.graph_column);
        const y = cy(i);
        const isHead = commit.refs?.some((r: string) => r.startsWith("HEAD"));

        return (
          <g key={commit.sha}>
            <circle
              cx={x}
              cy={y}
              r={DOT_R}
              fill={isHead ? "#000080" : "#c0c0c0"}
              stroke="#808080"
              strokeWidth={1.5}
            />
            {isHead && (
              <circle cx={x} cy={y} r={DOT_R + 3} fill="none" stroke="#000080" strokeWidth={1.5} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
