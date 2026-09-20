import { useState, useEffect } from 'react';
import { Layers, Sparkles, Loader2, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import Modal from '../components/Modal';
import { API_BASE } from '../utils/api';
import { baseName } from '../utils/cards';

function whenLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).replace('T', ' ');
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function filesLabel(files) {
  const names = [...new Set(files.map(baseName))];
  if (names.length === 0) return 'No files changed';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

export default function SessionsModal({ token, project, apiKeyConfigured, onClose, onGenerated, onSimulate }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);
  const [results, setResults] = useState({});

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (res.ok) setSessions(await res.json());
    } catch {
      // Backend offline; the empty state explains what to do.
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
      // Sending the active project is what lets teammates see the lessons made from this session.
      const headers = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(project?.id ? { 'X-Project-Id': project.id } : {}),
      };
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/generate`, { method: 'POST', headers });
      const data = await res.json();
      let msg;
      if (!res.ok) {
        msg = 'Something went wrong making lessons for this session.';
      } else if (data.created > 0) {
        msg = `Made ${data.created} new ${data.created > 1 ? 'lessons' : 'lesson'}. Find ${data.created > 1 ? 'them' : 'it'} in Learn.`;
        if (data.deferred > 0) msg += ` ${data.deferred} more ${data.deferred > 1 ? 'files are' : 'file is'} waiting, so press the button again.`;
        // Signed-in lessons are meant to reach the team. Say so plainly when the shared database refused them.
        if (data.share_expected && data.shared < data.created) {
          msg += ' Only you can see them for now: saving to your team’s shared database was blocked, so teammates won’t get them yet.';
        }
      } else if (data.already_generated > 0) {
        msg = 'You already have lessons for these changes.';
      } else {
        msg = 'Nothing here was big enough to teach (just small or non-code changes).';
      }
      setResults((prev) => ({ ...prev, [sessionId]: msg }));
      fetchSessions();
      onGenerated();
    } catch {
      setResults((prev) => ({ ...prev, [sessionId]: 'Couldn’t reach Cue’s helper. Is it running?' }));
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <Modal
      title="Your coding sessions"
      icon={Layers}
      wide
      onClose={onClose}
      footer={<button className="btn btn-soft" onClick={fetchSessions}><RefreshCw size={15} /> Refresh</button>}
    >
      <p className="muted">
        Pick a session and Cue will turn what changed into lessons.
        {token && project && <> They&rsquo;ll be shared with <strong>{project.name}</strong>, so your team can learn from them too.</>}
        {!apiKeyConfigured && ' (No AI key yet, so you’ll get simple sample lessons.)'}
      </p>

      {sessions.length === 0 ? (
        <div className="empty empty-flat">
          <h3>{loading ? 'Looking for sessions…' : 'No sessions yet'}</h3>
          {!loading && (
            <>
              <p className="muted">Use your coding assistant in a terminal and its sessions will appear here on their own.</p>
              <button className="btn btn-soft" onClick={onSimulate}>Try it with a sample session</button>
            </>
          )}
        </div>
      ) : (
        <ul className="session-list">
          {sessions.map((s) => {
            const open = expandedId === s.id;
            const busy = generatingId === s.id;
            return (
              <li key={s.id} className="session">
                <div className="session-row">
                  <button className="session-info" onClick={() => setExpandedId(open ? null : s.id)} aria-expanded={open}>
                    {open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                    <span>
                      <strong>{whenLabel(s.last_activity)}</strong>
                      <span className="muted small">
                        {s.source === 'agy_transcript' ? 'Antigravity' : 'Gemini CLI'} · {filesLabel(s.files)}
                        {s.cards_generated > 0 && ' · lessons made'}
                      </span>
                    </span>
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={generatingId !== null || s.edit_count === 0}
                    onClick={() => handleGenerate(s.id)}
                  >
                    {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                    {busy ? 'Working…' : 'Make lessons'}
                  </button>
                </div>
                {results[s.id] && <p className="status-line">{results[s.id]}</p>}
                {open && (
                  <ul className="event-list">
                    {s.events.map((e, i) => (
                      <li key={i}>
                        <span className="muted small">{e.ts}</span>
                        <span>{e.kind === 'edit' ? `Edited ${baseName(e.file)}${e.summary ? ` – ${e.summary}` : ''}` : `Ran a command: ${e.summary}`}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
