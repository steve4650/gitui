import { useMemo } from "react";

export const ROW_H = 52;
const COL_W = 18;
const PAD_X = 8;
const DOT_R = 5;

export type Commit = {
  sha: string;
  graph_column: number;
  parents: string[];
  refs?: string[];
};

type GraphProps = {
  commit: Commit;
  commits: Commit[];
  activeColumns: number[];
  maxCol: number;
};

/** For each row, tell which graph columns have an active line through it.
 *  A column is active if a commit in that column either IS this row or has
 *  a parent-child relationship crossing this row (covers both merge joins
 *  and branch continuations).
 */
export function computeActiveColumns(commits: Commit[]): Set<number>[] {
  if (!commits.length) return [];

  const shaIdx = new Map<string, number>();
  commits.forEach((c, i) => shaIdx.set(c.sha, i));

  const colMin = new Map<number, number>();
  const colMax = new Map<number, number>();

  commits.forEach((c, i) => {
    const col = c.graph_column;
    if (!colMin.has(col) || i < colMin.get(col)!) colMin.set(col, i);
    if (!colMax.has(col) || i > colMax.get(col)!) colMax.set(col, i);
  });

  commits.forEach((c, i) => {
    for (const pSha of c.parents) {
      const pi = shaIdx.get(pSha);
      if (pi === undefined) continue;
      const pc = commits[pi].graph_column;
      if (!colMin.has(pc) || i < colMin.get(pc)!) colMin.set(pc, i);
      if (!colMax.has(pc) || pi > colMax.get(pc)!) colMax.set(pc, pi);
    }
  });

  return commits.map((_, i) => {
    const cols = new Set<number>();
    for (const [col, lo] of colMin) {
      if (lo <= i && i <= colMax.get(col)!) cols.add(col);
    }
    return cols;
  });
}

export default function GitGraphRow({ commit, commits, activeColumns, maxCol }: GraphProps) {
  const shaIndex = useMemo(() => {
    const m = new Map<string, number>();
    commits.forEach((c, i) => m.set(c.sha, i));
    return m;
  }, [commits]);

  const effectiveWidth = Math.max(maxCol, ...activeColumns) + 1;
  const svgWidth = effectiveWidth * COL_W + PAD_X * 2;
  const x = PAD_X + commit.graph_column * COL_W;
  const centerY = ROW_H / 2;
  const isHead = commit.refs?.some((r: string) => r.startsWith("HEAD"));

  return (
    <svg width={svgWidth} height={ROW_H} className="git-graph-cell" aria-hidden>
      {/* Vertical lines for every active column */}
      {activeColumns.map((col) => {
        const cx = PAD_X + col * COL_W;
        return (
          <line key={col} x1={cx} y1={0} x2={cx} y2={ROW_H} stroke="#808080" strokeWidth={2} />
        );
      })}

      {/* Horizontal merge lines to parents in different columns */}
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
