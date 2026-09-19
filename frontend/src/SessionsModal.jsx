import React, { useState, useEffect } from 'react';
import { Layers, RefreshCw, Sparkles, FileCode, Terminal, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001';

export default function SessionsModal({ token, apiKeyConfigured, onClose, onGenerated }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);
  const [results, setResults] = useState({});

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (res.ok) setSessions(await res.json());
    } catch (e) {
      console.error('Failed to fetch sessions', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleGenerate = async (sessionId) => {
    setGeneratingId(sessionId);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/generate`, { method: 'POST', headers });
      const data = await res.json();
      let msg;
      if (!res.ok) {
        msg = 'Could not generate cards for this session.';
      } else if (data.created > 0) {
        msg = `Created ${data.created} card${data.created > 1 ? 's' : ''}.`;
        if (data.deferred > 0) msg += ` ${data.deferred} more file(s) left, click again.`;
      } else if (data.already_generated > 0) {
        msg = 'Cards for these changes were already generated.';
      } else {
        msg = 'Nothing worth a card here (only small or non-code changes).';
      }
      setResults(prev => ({ ...prev, [sessionId]: msg }));
      fetchSessions();
      onGenerated();
    } catch (e) {
      setResults(prev => ({ ...prev, [sessionId]: 'Backend unreachable.' }));
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={20} className="text-indigo-400" />
            Sessions
          </div>
          <button className="btn btn-ghost" onClick={onClose}>×</button>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '10px' }}>
          Cue logs your CLI activity per session. Cards are only generated when you click Generate.
          {!apiKeyConfigured && ' (No API key set: template cards will be used.)'}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {sessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
              <Terminal size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '14px' }}>{loading ? 'Loading...' : 'No sessions logged yet.'}</p>
              {!loading && <p style={{ fontSize: '12px', marginTop: '6px' }}>Run Gemini CLI or Antigravity CLI and make some edits.</p>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sessions.map((s) => (
                <div key={s.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div onClick={() => setExpandedId(expandedId === s.id ? null : s.id)} style={{ cursor: 'pointer', minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-normal)' }}>
                        {expandedId === s.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        <span style={{ fontFamily: 'monospace' }}>#{s.id.slice(0, 8)}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{s.source === 'agy_transcript' ? 'Antigravity' : 'Gemini CLI'}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{s.last_activity.replace('T', ' ')}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px', marginLeft: '23px' }}>
                        {s.edit_count} edit{s.edit_count !== 1 ? 's' : ''} across {s.files.length} file{s.files.length !== 1 ? 's' : ''}
                        {s.command_count > 0 && `, ${s.command_count} command${s.command_count !== 1 ? 's' : ''}`}
                        {s.cards_generated > 0 && `, ${s.cards_generated} card set${s.cards_generated !== 1 ? 's' : ''} generated`}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={generatingId !== null || s.edit_count === 0}
                      onClick={() => handleGenerate(s.id)}
                    >
                      {generatingId === s.id ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                      {generatingId === s.id ? 'Generating...' : 'Generate Cards'}
                    </button>
                  </div>

                  {results[s.id] && (
                    <div style={{ padding: '0 14px 10px 37px', fontSize: '12px', color: '#34d399' }}>{results[s.id]}</div>
                  )}

                  {expandedId === s.id && (
                    <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', background: '#090d16', fontFamily: 'monospace', fontSize: '12px', color: '#94a3b8', maxHeight: '220px', overflowY: 'auto' }}>
                      {s.events.map((e, i) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', padding: '2px 0' }}>
                          <span style={{ color: 'var(--text-dim)' }}>{e.ts}</span>
                          {e.kind === 'edit' ? <FileCode size={13} style={{ marginTop: '2px', flexShrink: 0 }} /> : <Terminal size={13} style={{ marginTop: '2px', flexShrink: 0 }} />}
                          <span style={{ wordBreak: 'break-all' }}>{e.kind === 'edit' ? `${e.file}${e.summary ? ' - ' + e.summary : ''}` : e.summary}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={fetchSessions}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
