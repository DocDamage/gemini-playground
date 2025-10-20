// /renderer/dashboard/ReportsPane.tsx
/**
 * Purpose: UI for displaying telemetry and error reports.
 * Fetches the main report JSON from the server's /report
 * endpoint and renders all its sections.
 *
 * Conforms to Batch 7 of MASTER_BUILD_GUIDE.md.
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button'; // Assuming shadcn/ui button

// Define the shape of the report, based on report.js
// We only define the parts we're rendering
interface ReportData {
  timestamp: string;
  system: {
    hostname: string;
    uptime: number;
    load: number[];
    memory: { used: number; total: number };
  } | null;
  ai: {
    all: {
      totalCalls: number;
      totalErrors: number;
      avgLatency: number;
      recentCalls: any[];
    };
    voice: {
      totalCalls: number;
      avgLatency: number;
      recentCalls: any[];
    };
  } | null;
  runtime: {
    totalRuns: number;
    totalErrors: number;
    avgDuration: number;
    recentRuns: any[];
  } | null;
  audit: {
    type: string;
    timestamp: string;
    actor: string;
  }[] | null;
  alerts: string[] | null;
}

const ReportsPane: React.FC = () => {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch the report from the server
  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      // This port must match the port in /server/index.js
      const response = await fetch('http://localhost:5173/report');
      if (!response.ok) {
        throw new Error(`Failed to fetch report: ${response.statusText}`);
      }
      const data = await response.json();
      setReport(data.report); // The API returns { ok: true, report: {...} }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch on component mount
  useEffect(() => {
    fetchReport();
  }, []);

  if (loading) {
    return <div className="p-4 text-text-muted">Loading reports...</div>;
  }

  if (error) {
    return (
      <div className="p-4 text-error">
        <p>Error loading report: {error}</p>
        <Button onClick={fetchReport} className="mt-2">Retry</Button>
      </div>
    );
  }

  if (!report) {
    return <div className="p-4 text-text-muted">No report data found.</div>;
  }

  // Helper to format memory
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${['B', 'KB', 'MB', 'GB'][i]}`;
  };

  return (
    <div className="reports-pane h-full overflow-y-auto p-4 space-y-4 bg-bg">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">System Telemetry</h1>
        <Button onClick={fetchReport} size="sm" variant="outline">Refresh</Button>
      </div>
      <p className="text-sm text-text-muted">Report generated: {new Date(report.timestamp).toLocaleString()}</p>

      {/* System Stats */}
      {report.system && (
        <section className="pane p-4 bg-panel">
          <h2 className="text-lg font-semibold mb-2">System</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-text-muted">Hostname</div>
              <div className="font-medium">{report.system.hostname}</div>
            </div>
            <div>
              <div className="text-text-muted">Uptime</div>
              <div className="font-medium">{report.system.uptime.toFixed(0)}s</div>
            </div>
            <div>
              <div className="text-text-muted">Load Avg</div>
              <div className="font-medium">{report.system.load[0].toFixed(2)}</div>
            </div>
            <div>
              <div className="text-text-muted">Memory</div>
              <div className="font-medium">
                {formatBytes(report.system.memory.used)} / {formatBytes(report.system.memory.total)}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* AI & Voice Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {report.ai?.all && (
          <section className="pane p-4 bg-panel">
            <h2 className="text-lg font-semibold mb-2">AI Telemetry (All)</h2>
            <div className="grid grid-cols-3 gap-2 text-sm mb-4">
              <div>
                <div className="text-text-muted">Total Calls</div>
                <div className="font-medium">{report.ai.all.totalCalls}</div>
              </div>
              <div>
                <div className="text-text-muted">Total Errors</div>
                <div className="font-medium text-error">{report.ai.all.totalErrors}</div>
              </div>
              <div>
                <div className="text-text-muted">Avg Latency</div>
                <div className="font-medium">{report.ai.all.avgLatency.toFixed(0)} ms</div>
              </div>
            </div>
          </section>
        )}
        {report.ai?.voice && (
          <section className="pane p-4 bg-panel">
            <h2 className="text-lg font-semibold mb-2">AI Telemetry (Voice)</h2>
            <div className="grid grid-cols-3 gap-2 text-sm mb-4">
              <div>
                <div className="text-text-muted">Total Calls</div>
                <div className="font-medium">{report.ai.voice.totalCalls}</div>
              </div>
              <div>
                <div className="text-text-muted">Avg Latency</div>
                <div className="font-medium">{report.ai.voice.avgLatency.toFixed(0)} ms</div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Runtime Stats */}
      {report.runtime && (
        <section className="pane p-4 bg-panel">
          <h2 className="text-lg font-semibold mb-2">Runtime Telemetry</h2>
          <div className="grid grid-cols-3 gap-2 text-sm mb-4">
            <div>
              <div className="text-text-muted">Total Runs</div>
              <div className="font-medium">{report.runtime.totalRuns}</div>
            </div>
            <div>
              <div className="text-text-muted">Total Errors</div>
              <div className="font-medium text-error">{report.runtime.totalErrors}</div>
            </div>
            <div>
              <div className="text-text-muted">Avg Duration</div>
              <div className="font-medium">{report.runtime.avgDuration.toFixed(2)} ms</div>
            </div>
          </div>
          <h3 className="font-semibold mb-2 text-sm">Recent Runs</h3>
          <div className="overflow-auto border rounded-lg max-h-64">
            <table className="w-full text-sm">
              <thead className="bg-panel-secondary sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Lang</th>
                  <th className="px-3 py-2 text-left">Duration</th>
                  <th className="px-3 py-2 text-left">Success</th>
                  <th className="px-3 py-2 text-left">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.runtime.recentRuns.map((run, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{run.lang}</td>
                    <td className="px-3 py-2">{run.duration}ms</td>
                    <td className={`px-3 py-2 ${run.success ? 'text-success' : 'text-error'}`}>{run.success ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{new Date(run.timestamp).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Audit Log */}
      {report.audit && (
        <section className="pane p-4 bg-panel">
          <h2 className="text-lg font-semibold mb-2">Recent Audit Events</h2>
          <div className="overflow-auto border rounded-lg max-h-64">
            <table className="w-full text-sm">
              <thead className="bg-panel-secondary sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Event</th>
                  <th className="px-3 py-2 text-left">Actor</th>
                  <th className="px-3 py-2 text-left">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.audit.map((entry, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-mono text-xs">{entry.type}</td>
                    <td className="px-3 py-2">{entry.actor}</td>
                    <td className="px-3 py-2 font-mono text-xs">{new Date(entry.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export default ReportsPane;