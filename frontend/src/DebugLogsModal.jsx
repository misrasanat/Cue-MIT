import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, ChevronRight, ChevronDown, CheckCircle2, Zap, FileCode, Terminal } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001';

export default function DebugLogsModal({ onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error("Failed to fetch debug logs", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={20} className="text-indigo-400" />
            Live Hook Debug Stream
            <span style={{ fontSize: '11px', background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', padding: '2px 8px', borderRadius: '12px', marginLeft: '6px' }}>
              Live Polling (1.5s)
            </span>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
              <Terminal size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '14px' }}>No hook events received yet.</p>
              <p style={{ fontSize: '12px', marginTop: '6px' }}>Run Gemini CLI in terminal (e.g. <code>gemini "refactor auth"</code>) to trigger events!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {logs.map((log) => (
                <div key={log.id} style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div 
                    onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                    style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: expandedLogId === log.id ? 'rgba(255, 255, 255, 0.04)' : 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-dim)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                        {log.timestamp}
                      </span>
                      <span style={{ 
                        fontSize: '12px', 
                        fontWeight: '600', 
                        padding: '2px 8px', 
                        borderRadius: '4px',
                        background: log.tool_name === 'update_topic' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(52, 211, 153, 0.15)',
                        color: log.tool_name === 'update_topic' ? '#818cf8' : '#34d399'
                      }}>
                        {log.tool_name}
                      </span>
                      <span style={{ fontSize: '13px', color: 'var(--text-normal)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                        {log.summary}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Session #{log.session_id}</span>
                      {expandedLogId === log.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                  </div>

                  {expandedLogId === log.id && (
                    <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', background: '#090d16', fontFamily: 'monospace', fontSize: '12px', color: '#94a3b8', maxHeight: '200px', overflowY: 'auto' }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {JSON.stringify(log.raw_event, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Showing last {logs.length} events</span>
          <button className="btn btn-secondary" onClick={fetchLogs}>
            <RefreshCw size={14} /> Refresh Logs
          </button>
        </div>
      </div>
    </div>
  );
}
