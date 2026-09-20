import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Sparkles, KeyRound } from 'lucide-react';
import { API_BASE } from '../utils/api';
import { baseName, isLive, sourceName, timeAgo } from '../utils/cards';

// One coding session from a teammate, as it was shared from their machine.
export default function TeamSession({ session, projectId, token, canGenerate, showAuthor = true, onGenerated }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const live = isLive(session.last_activity);
  const files = [...new Set(session.files.map(baseName))];
  const summary = session.last_intent
    || session.events.find((e) => e.kind === 'edit' && e.summary)?.summary
    || `Edited ${files.length} ${files.length === 1 ? 'file' : 'files'}`;

  const makeLessons = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch(
        `${API_BASE}/projects/${projectId}/sessions/${session.user_id}/${encodeURIComponent(session.id)}/generate`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message || data.error || 'Something went wrong making lessons.');
      } else if (data.created > 0) {
        setMessage(`Made ${data.created} ${data.created > 1 ? 'lessons' : 'lesson'} from ${session.author}’s work. Find ${data.created > 1 ? 'them' : 'it'} under their name.`
          + (data.deferred > 0 ? ` ${data.deferred} more ${data.deferred > 1 ? 'files are' : 'file is'} waiting, so press the button again.` : '')
          + (data.failed > 0 ? ` ${data.failed} couldn’t be written just now, so press the button again.` : ''));
        onGenerated();
      } else if (data.message) {
        setMessage(data.message);
      } else if (data.failed > 0) {
        setMessage('The AI couldn’t write these lessons just now. Nothing was lost, so try again in a moment.');
      } else if (data.already_generated > 0) {
        setMessage('Lessons for these changes already exist.');
      } else {
        setMessage('Nothing here was big enough to teach (just small or non-code changes).');
      }
    } catch {
      setMessage('Couldn’t reach Cue’s helper. Is it running?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`team-session ${live ? 'is-live' : ''}`}>
      <div className="team-session-top">
        {showAuthor && (
          <span className="team-session-author">
            <span className="avatar" aria-hidden="true">{session.author[0]}</span>
            {session.author}
          </span>
        )}
        <span className="team-session-when">
          {live && <span className="live-dot" aria-hidden="true" />}
          {live ? 'Working now' : timeAgo(session.last_activity)}
          <span className="team-session-source">{sourceName(session.source)}</span>
        </span>
      </div>

      <p className="team-session-summary">{summary}</p>

      {files.length > 0 && (
        <div className="team-session-files">
          {files.slice(0, 4).map((f) => <code key={f}>{f}</code>)}
          {files.length > 4 && <span className="muted small">+{files.length - 4} more</span>}
        </div>
      )}

      <div className="team-session-foot">
        <span className="muted small">
          {session.edit_count} {session.edit_count === 1 ? 'edit' : 'edits'}
          {session.cards_generated > 0 && ` · ${session.cards_generated} ${session.cards_generated === 1 ? 'lesson' : 'lessons'} made`}
        </span>
        <div className="team-session-actions">
          <button className="link-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? <>Hide changes <ChevronUp size={14} /></> : <>See what changed <ChevronDown size={14} /></>}
          </button>
          <button className="btn btn-soft" onClick={makeLessons} disabled={busy || !canGenerate}>
            {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
            {busy ? 'Working…' : 'Turn into lessons'}
          </button>
        </div>
      </div>

      {!canGenerate && (
        <p className="team-session-hint"><KeyRound size={14} aria-hidden="true" /> Making lessons from a teammate&rsquo;s session needs you to be signed in and the model connected (META_API_KEY in backend/.env).</p>
      )}
      {message && <p className="status-line team-session-message" role="status">{message}</p>}

      {open && (
        <ul className="event-list">
          {session.events.map((e, i) => (
            <li key={i}>
              <span className="muted small">{timeAgo(e.at)}</span>
              <span>{e.kind === 'edit' ? `Edited ${baseName(e.file)}${e.summary ? ` – ${e.summary}` : ''}` : 'Ran a command'}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
