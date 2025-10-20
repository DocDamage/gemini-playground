import React, { useMemo } from "react";
import { Diff, Hunk, parseDiff } from "react-diff-view";
import "react-diff-view/style/index.css";
import * as JsDiff from "diff";

interface SimpleDiffProps {
  original: string;
  updated: string;
  fileName?: string;
}

export default function SimpleDiff({ original, updated, fileName = "file.ts" }: SimpleDiffProps) {
  const diffs = useMemo(() => {
    if (original === updated) return [];
    const unified = JsDiff.createPatch(fileName, original, updated, "current", "new");
    return parseDiff(unified);
  }, [original, updated, fileName]);

  return (
    <div style={{ background: "#111", color: "#ddd", height: "100%", overflowY: "auto" }}>
      <div style={{ padding: "0.5rem 1rem", borderBottom: "1px solid #333" }}>
        <h3 style={{ margin: 0 }}>Diff Viewer</h3>
        <small>{fileName}</small>
      </div>

      {diffs.length > 0 ? (
        diffs.map(({ hunks, newPath }) => (
          <Diff
            key={newPath}
            viewType="split"
            diffType="modify"
            hunks={hunks}
            renderHunk={(hunk) => <Hunk key={hunk.content} hunk={hunk} />}
          />
        ))
      ) : (
        <pre style={{ padding: "1rem", color: "#888" }}>No differences found</pre>
      )}
    </div>
  );
}
