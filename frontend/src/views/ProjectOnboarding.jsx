import { useState } from 'react';
import { Building2, Plus, ArrowRight, Link, Loader2 } from 'lucide-react';
import { API_BASE } from '../utils/api';

export default function ProjectOnboarding({ user, token, onProjectCreated }) {
  const [mode, setMode] = useState('create'); // 'create' | 'join'
  const [orgName, setOrgName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [inviteTokenOrUrl, setInviteTokenOrUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!orgName.trim() || !projectName.trim()) return;
    setSubmitting(true);
    setErrorMsg('');

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // 1. Create Org
      const orgRes = await fetch(`${API_BASE}/organizations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: orgName.trim(), user_id: user?.id, email: user?.email })
      });
      if (!orgRes.ok) throw new Error('Failed to create organization');
      const org = await orgRes.json();

      // 2. Create Project
      const projRes = await fetch(`${API_BASE}/organizations/${org.id}/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: projectName.trim(), user_id: user?.id, email: user?.email })
      });
      if (!projRes.ok) throw new Error('Failed to create project');
      const proj = await projRes.json();

      onProjectCreated(proj);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to set up project');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    const input = inviteTokenOrUrl.trim();
    if (!input) return;
    setSubmitting(true);
    setErrorMsg('');

    let tokenToUse = input;
    if (input.includes('token=')) {
      const match = input.match(/token=([a-zA-Z0-9_-]+)/);
      if (match) tokenToUse = match[1];
    }

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/invites/${tokenToUse}/accept`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_id: user?.id, email: user?.email })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to accept invite');
      }
      const data = await res.json();
      onProjectCreated(data.project);
    } catch (err) {
      setErrorMsg(err.message || 'Invalid or expired invite link');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: '640px', margin: '40px auto' }}>
      <header className="page-head" style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ display: 'inline-flex', padding: '12px', background: 'var(--brand-soft)', borderRadius: '50%', color: 'var(--brand)', marginBottom: '12px' }}>
          <Building2 size={32} />
        </div>
        <h1>Set up your Team Project</h1>
        <p className="muted" style={{ fontSize: '15px' }}>
          Cue transforms code edits into shared collective knowledge. Create your team project or join an existing one to get started.
        </p>
      </header>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '24px' }}>
        <button
          className={`btn ${mode === 'create' ? 'btn-primary' : 'btn-soft'}`}
          onClick={() => { setMode('create'); setErrorMsg(''); }}
        >
          <Plus size={16} /> Create a Project
        </button>
        <button
          className={`btn ${mode === 'join' ? 'btn-primary' : 'btn-soft'}`}
          onClick={() => { setMode('join'); setErrorMsg(''); }}
        >
          <Link size={16} /> Enter Invite Link
        </button>
      </div>

      {errorMsg && (
        <div className="notice notice-warn" style={{ marginBottom: '16px' }}>
          <div><strong>Notice:</strong> {errorMsg}</div>
        </div>
      )}

      {mode === 'create' ? (
        <form onSubmit={handleCreate} className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="field">
              <span>Organization or Company Name</span>
              <input
                type="text"
                required
                className="input-field"
                placeholder="e.g. Acme Corp"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </label>
          </div>

          <div>
            <label className="field">
              <span>Project Name</span>
              <input
                type="text"
                required
                className="input-field"
                placeholder="e.g. Payment Gateway Core"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </label>
          </div>

          <button className="btn btn-primary btn-lg" type="submit" disabled={submitting || !orgName.trim() || !projectName.trim()} style={{ marginTop: '8px', justifyContent: 'center' }}>
            {submitting ? <Loader2 size={18} className="spin" /> : <Plus size={18} />} Create Team Project
          </button>
        </form>
      ) : (
        <form onSubmit={handleJoin} className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="field">
              <span>Paste Invite Link or Token</span>
              <input
                type="text"
                required
                className="input-field"
                placeholder="http://localhost:5173/join?token=... or token"
                value={inviteTokenOrUrl}
                onChange={(e) => setInviteTokenOrUrl(e.target.value)}
              />
            </label>
          </div>

          <button className="btn btn-primary btn-lg" type="submit" disabled={submitting || !inviteTokenOrUrl.trim()} style={{ marginTop: '8px', justifyContent: 'center' }}>
            {submitting ? <Loader2 size={18} className="spin" /> : <ArrowRight size={18} />} Accept & Join
          </button>
        </form>
      )}
    </div>
  );
}
