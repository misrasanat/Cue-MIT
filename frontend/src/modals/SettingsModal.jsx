import { useState } from 'react';
import { Settings, User, Terminal, Layers, Activity, Key, Check, RotateCcw } from 'lucide-react';
import Modal from '../components/Modal';
import { API_BASE } from '../utils/api';

export default function SettingsModal({ session, apiKeyConfigured, onKeyChanged, onOpen, onStartOver, onClose }) {
  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem('cue_gemini_api_key') || ''; } catch { return ''; }
  });
  const [status, setStatus] = useState('');
  const [confirming, setConfirming] = useState(false);

  const saveKey = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      try { localStorage.setItem('cue_gemini_api_key', apiKey); } catch { /* not persisted */ }
      onKeyChanged(data.api_key_configured);
      setStatus(data.api_key_configured ? 'Saved. Lessons will now be written about your code.' : 'Key removed.');
    } catch {
      setStatus('Couldn’t save. Is Cue’s helper running?');
    }
    setTimeout(() => setStatus(''), 4000);
  };

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

      <form className="setting setting-col" onSubmit={saveKey}>
        <div className="setting-text">
          <h3><Key size={16} aria-hidden="true" /> AI key</h3>
          <p className="muted">
            {apiKeyConfigured
              ? 'Connected. Lessons are written about your actual code.'
              : 'Not connected, so you’ll see sample explanations. Add a Gemini key for lessons about your code.'}
          </p>
        </div>
        <div className="inline-form">
          <input
            className="input"
            type="password"
            placeholder="Paste a key (optional)"
            aria-label="Gemini API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button className="btn btn-primary" type="submit">Save</button>
        </div>
        {status && <p className="status-line"><Check size={14} aria-hidden="true" /> {status}</p>}
      </form>

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
