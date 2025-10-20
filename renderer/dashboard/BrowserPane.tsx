// /renderer/dashboard/BrowserPane.tsx
/**
 * Purpose: Embedded browser and web fetch tool.
 * Provides a UI to fetch and render content from a URL,
 * funneled through the secure webFetch core module.
 *
 * Conforms to Batch 4 of MASTER_BUILD_GUIDE.md (Section 4.5).
 */

import React, { useState } from 'react';
// import { useSettings } from '../context/SettingsContext'; // To be added

/**
 * A simple component to render raw HTML/Text content in a sandboxed iframe.
 */
const ContentRenderer: React.FC<{ content: string }> = ({ content }) => {
  return (
    <iframe
      title="BrowserPaneContent"
      sandbox="allow-scripts allow-same-origin" // Sandboxed for security
      srcDoc={content} // Render content directly as HTML
      className="w-full h-full bg-white"
    />
  );
};

export const BrowserPane: React.FC = () => {
  const [url, setUrl] = useState<string>('https://api.github.com/zen');
  const [content, setContent] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  
  // const { settings } = useSettings(); // Will be wired up
  // Placeholder settings
  const fetchConfig = {
    retries: 2,
    timeout: 8000,
    // ttl: settings.web.cacheTTL
    // whitelist: settings.web.domainWhitelist
  };

  const handleFetch = async () => {
    if (!url) return;
    setStatus('loading');
    setContent('');
    try {
      // Use the fileBridge to call the secure main process fetch
      const result = await window.fileBridge.webFetch(url, {}, fetchConfig);
      
      // VERIFY_BEFORE_COMMIT: The webFetch call in Batch 1 (via server/index.js)
      // was built to return JSON. This will be corrected when
      // we update webFetch.js later in this batch.
      // For now, we'll optimistically render whatever text comes back.
      if (typeof result.data === 'object') {
        setContent(JSON.stringify(result.data, null, 2));
      } else {
        setContent(result.data);
      }
      setStatus('idle');
    } catch (err: any) {
      console.error('BrowserPane fetch error:', err);
      setContent(`Error fetching URL: ${err.message}`);
      setStatus('error');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleFetch();
    }
  };

  return (
    <div className="browser-pane flex flex-col h-full bg-panel p-4 gap-4">
      {/* Address Bar and Controls */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter a URL to fetch..."
          className="flex-grow bg-panel-secondary border border-border rounded-md px-3 py-1.5 text-sm"
        />
        <button
          onClick={handleFetch}
          disabled={status === 'loading'}
          className="run-button px-4 py-1.5 bg-primary text-white rounded text-sm hover:bg-opacity-90 disabled:bg-gray-400"
        >
          {status === 'loading' ? 'Fetching...' : 'Go'}
        </button>
        {/* // VERIFY_BEFORE_COMMIT: Add "Add to Favorites" button */}
      </div>

      {/* Content View */}
      <div className="content-view flex-grow border rounded-lg shadow-sm bg-white overflow-hidden">
        {status === 'idle' && !content && (
          <div className="flex items-center justify-center h-full text-text-muted">
            Fetch a URL to see the content here.
          </div>
        )}
        {(status === 'error' || (status === 'idle' && content)) && (
          <ContentRenderer content={content} />
        )}
        {status === 'loading' && (
          <div className="flex items-center justify-center h-full text-text-muted">
            Loading...
          </div>
        )}
      </div>
    </div>
  );
};

export default BrowserPane;