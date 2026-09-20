import { useState, useEffect } from 'react';
import { Settings, User, Terminal, Layers, Activity, Key, RotateCcw, Radio } from 'lucide-react';
import Modal from '../components/Modal';
import { LOCAL_API_BASE } from '../utils/api';
import { timeAgo } from '../utils/cards';

export default function SettingsModal({ session, apiKeyConfigured, onOpen, onStartOver, onClose }) {
  const [confirming, setConfirming] = useState(false);
  const [share, setShare] = useState(null);

  useEffect(() => {
    fetch(`${LOCAL_API_BASE}/share/status`).then((r) => (r.ok ? r.json() : null)).then(setShare).catch(() => setShare(null));
  }, []);

  let shareText = 'Checking\u2026';
  if (share?.error) shareText = share.hint || 'Something is blocking sharing with your team.';
  else if (share?.last_ok) shareText = `Working. Last sent ${timeAgo(share.last_ok)}.`;
  else if (share) shareText = 'Nothing shared yet. Run cue link in a project folder, then code as usual.';

  return (
    <Modal title="Settings" icon={Settings} onClose={onClose}>
      <section className="setting">
        <div className="setting-text">
          <h3><User size={16} aria-hidden="true" /> Account</h3>
          <p className="muted">{session ? `Signed in as ${session.user.email}` : 'Sign in to keep your lessons across devices.'}</p>
        </div>
        <button className="btn btn-soft" onClick={() => onOpen('auth')}>{session ? 'Manage' : 'Sign in'}</button>
      </section>

      <section className="setting">
        <div className="setting-text">
          <h3><Terminal size={16} aria-hidden="true" /> Connect your terminal</h3>
          <p className="muted">So Cue can see what your coding assistant changes.</p>
        </div>
        <button className="btn btn-soft" onClick={() => onOpen('setup')}>Show steps</button>
      </section>

      <section className="setting">
        <div className="setting-text">
          <h3><Layers size={16} aria-hidden="true" /> Coding sessions</h3>
          <p className="muted">Turn what you built into lessons.</p>
        </div>
        <button className="btn btn-soft" onClick={() => onOpen('sessions')}>Open</button>
      </section>

      <section className="setting">
        <div className="setting-text">
          <h3><Radio size={16} aria-hidden="true" /> Live sharing</h3>
          <p className={share?.error ? 'status-warn' : 'muted'}>{shareText}</p>
        </div>
      </section>

      <section className="setting">
        <div className="setting-text">
          <h3><Key size={16} aria-hidden="true" /> AI model</h3>
          <p className="muted">
            {apiKeyConfigured
              ? 'Connected. Cue’s model writes lessons about your actual code.'
              : 'Not connected, so you’ll see sample explanations. Add META_API_KEY to backend/.env and restart Cue.'}
          </p>
        </div>
      </section>

      <details className="advanced">
        <summary>Advanced</summary>
        <section className="setting">
          <div className="setting-text">
            <h3><Activity size={16} aria-hidden="true" /> Activity log</h3>
            <p className="muted">The raw events Cue receives. Handy if something seems off.</p>
          </div>
          <button className="btn btn-soft" onClick={() => onOpen('debug')}>View</button>
        </section>

        <section className="setting">
          <div className="setting-text">
            <h3><RotateCcw size={16} aria-hidden="true" /> Start over</h3>
            <p className="muted">Clears your lessons, sessions and learning progress.</p>
          </div>
          {confirming ? (
            <div className="inline-form">
              <button className="btn btn-danger" onClick={() => { onStartOver(); setConfirming(false); onClose(); }}>Yes, clear everything</button>
              <button className="btn btn-soft" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn-soft" onClick={() => setConfirming(true)}>Clear</button>
          )}
        </section>
      </details>
    </Modal>
  );
}
