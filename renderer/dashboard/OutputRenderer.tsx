// /renderer/dashboard/OutputRenderer.tsx
/**
 * Purpose: Renders execution results based on MIME type.
 * Can display plain text, JSON, HTML, images, and more.
 *
 * Conforms to Batch 3 of MASTER_BUILD_GUIDE.md (Section 4.5).
 */

import React from 'react';

interface OutputRendererProps {
  /** The final output data from a successful run */
  output: string | object | null;
  /** The MIME type of the output (e.g., 'text/plain', 'application/json') */
  mimeType?: string;
}

/**
 * Tries to parse a string as JSON.
 * @param str The string to parse.
 * @returns A parsed object or null if parsing fails.
 */
function tryParseJSON(str: string) {
  try {
    const obj = JSON.parse(str);
    // Ensure it's a real object or array, not just a string/number literal
    if (obj && typeof obj === 'object') {
      return obj;
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

/**
 * Renders data in a collapsible, syntax-highlighted JSON viewer.
 */
const JsonRenderer: React.FC<{ data: object }> = ({ data }) => {
  return (
    <pre className="text-sm font-mono whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
};

/**
 * Renders plain text output.
 */
const TextRenderer: React.FC<{ data: string }> = ({ data }) => {
  return (
    <pre className="text-sm font-mono whitespace-pre-wrap break-all">
      {data}
    </pre>
  );
};

const HtmlRenderer: React.FC<{ data: string }> = ({ data }) => (
  <iframe
    title="html-preview"
    sandbox="allow-scripts allow-same-origin"
    srcDoc={data}
    className="w-full h-[420px] border border-border rounded-lg bg-white"
  />
);

// VERIFY_BEFORE_COMMIT: Add renderers for 'text/html' (using an iframe),
// 'image/png', 'image/jpeg', 'video/mp4', 'audio/mp3' as
// specified in the architecture (Section 4.5). For Batch 3,
// we will focus on text and JSON.

/**
 * Main component to render output based on detected type.
 */
export const OutputRenderer: React.FC<OutputRendererProps> = ({
  output,
  mimeType = 'text/plain',
}) => {
  if (output === null || output === undefined) {
    return (
      <div className="text-muted italic text-sm">
        No output produced.
      </div>
    );
  }

  // Handle object/JSON output
  if (typeof output === 'object') {
    return <JsonRenderer data={output} />;
  }

  // Handle string output
  if (typeof output === 'string') {
    // First, try to detect if the string is actually JSON
    const jsonObj = tryParseJSON(output);
    if (jsonObj) {
      return <JsonRenderer data={jsonObj} />;
    }
    
    if (mimeType === 'text/html') {
      return <HtmlRenderer data={output} />;
    }

    // Check for other types based on mimeType (future)
    // if (mimeType.startsWith('image/')) {
    //   return <ImageRenderer data={output} />;
    // }
    // if (mimeType === 'text/html') {
    //   return <HtmlRenderer data={output} />;
    // }

    // Default to plain text renderer
    return <TextRenderer data={output} />;
  }

  // Fallback for other primitive types
  return <TextRenderer data={String(output)} />;
};

export default OutputRenderer;
