import { useState, useEffect } from 'react';
import { Building2, Plus, Users, UserPlus, Link, Check, Copy, Loader2, ArrowRight } from 'lucide-react';
import Modal from '../components/Modal';
import { API_BASE } from '../utils/api';

export default function ProjectModal({
  user,
  token,
  projects,
  activeProject,
  onSelectProject,
  onProjectsChanged,
  onClose,
  initialTab = 'members'
}) {
  const [tab, setTab] = useState(projects.length === 0 ? 'create' : initialTab); // 'members' | 'create' | 'join'
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Form states
  const [orgName, setOrgName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteTokenOrUrl, setInviteTokenOrUrl] = useState('');
  const [generatedInvite, setGeneratedInvite] = useState(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch members when active project changes
  useEffect(() => {
    if (activeProject?.id && tab === 'members') {
      fetchMembers();
    }
  }, [activeProject?.id, tab]);

  const fetchMembers = async () => {
    if (!activeProject?.id) return;
    setLoadingMembers(true);
    try {
      const res = await fetch(`${API_BASE}/projects/${activeProject.id}/members`);
      if (res.ok) {
        setMembers(await res.json());
      }
    } catch {
      // Offline fallback
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!projectName.trim() || !orgName.trim()) return;
    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // 1. Create Org
      const orgRes = await fetch(`${API_BASE}/organizations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: orgName.trim(), user_id: user?.id })
      });
      if (!orgRes.ok) throw new Error('Failed to create organization');
      const org = await orgRes.json();

      // 2. Create Project
      const projRes = await fetch(`${API_BASE}/organizations/${org.id}/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: projectName.trim(), user_id: user?.id })
      });
      if (!projRes.ok) throw new Error('Failed to create project');
      const proj = await projRes.json();

      setSuccessMsg(`Project "${proj.name}" created!`);
      onProjectsChanged(proj);
      setTab('members');
    } catch (err) {
      setErrorMsg(err.message || 'Error creating project');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !activeProject?.id) return;
    setSubmitting(true);
    setErrorMsg('');
    setGeneratedInvite(null);

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/projects/${activeProject.id}/invite`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: inviteEmail.trim(), user_id: user?.id })
      });
      if (!res.ok) throw new Error('Failed to generate invite');
      const data = await res.json();
      setGeneratedInvite(data);
      setInviteEmail('');
      fetchMembers();
    } catch (err) {
      setErrorMsg(err.message || 'Error sending invite');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinProject = async (e) => {
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
        body: JSON.stringify({ user_id: user?.id })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to accept invite');
      }
      const data = await res.json();
      setSuccessMsg('Joined project successfully!');
      onProjectsChanged(data.project);
      setTab('members');
    } catch (err) {
      setErrorMsg(err.message || 'Invalid or expired invite link');
    } finally {
      setSubmitting(false);
    }
  };

  const copyInviteLink = () => {
    if (!generatedInvite?.invite_url) return;
    navigator.clipboard.writeText(generatedInvite.invite_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal title="Team Projects" icon={Building2} onClose={onClose} wide>
      <div className="project-modal-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {projects.length > 0 && (
          <button
            className={`btn btn-sm ${tab === 'members' ? 'btn-primary' : 'btn-soft'}`}
            onClick={() => { setTab('members'); setErrorMsg(''); setSuccessMsg(''); }}
          >
            <Users size={14} /> Team & Invites
          </button>
        )}
        <button
          className={`btn btn-sm ${tab === 'create' ? 'btn-primary' : 'btn-soft'}`}
          onClick={() => { setTab('create'); setErrorMsg(''); setSuccessMsg(''); }}
        >
          <Plus size={14} /> New Project
        </button>
        <button
          className={`btn btn-sm ${tab === 'join' ? 'btn-primary' : 'btn-soft'}`}
          onClick={() => { setTab('join'); setErrorMsg(''); setSuccessMsg(''); }}
        >
          <Link size={14} /> Join via Link
        </button>
      </div>

      {errorMsg && (
        <div className="notice notice-warn" style={{ marginTop: '12px' }}>
          <div><strong>Error:</strong> {errorMsg}</div>
        </div>
      )}

      {successMsg && (
        <div className="notice" style={{ marginTop: '12px', borderColor: 'var(--good)' }}>
          <div><strong>Success!</strong> {successMsg}</div>
        </div>
      )}

      {/* TAB 1: MEMBERS & INVITE */}
      {tab === 'members' && activeProject && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <span className="eyebrow">Active Project</span>
              <h3 style={{ margin: '2px 0 0 0', fontSize: '18px' }}>{activeProject.name}</h3>
            </div>
            {projects.length > 1 && (
              <select
                className="input-field"
                style={{ width: 'auto', padding: '6px 10px', fontSize: '13px' }}
                value={activeProject.id}
                onChange={(e) => {
                  const selected = projects.find((p) => p.id === e.target.value);
                  if (selected) onSelectProject(selected);
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Members List */}
          <section style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: '16px' }}>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '8px' }}>Project Members ({members.length})</span>
            {loadingMembers ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ink-2)', fontSize: '13px' }}>
                <Loader2 size={14} className="spin" /> Loading members...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {members.map((m) => (
                  <div key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', background: 'var(--surface)', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                    <span style={{ fontWeight: 600 }}>{m.email}</span>
                    <span className="badge" style={{ textTransform: 'capitalize' }}>{m.role || 'member'}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Invite Teammate Form */}
          <form onSubmit={handleCreateInvite} style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '6px' }}>Invite a Teammate</span>
            <p className="muted" style={{ fontSize: '12.5px', marginBottom: '10px' }}>Generate a shareable invite link for your team.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="email"
                required
                className="input-field"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" type="submit" disabled={submitting || !inviteEmail.trim()}>
                {submitting ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />} Invite
              </button>
            </div>

            {generatedInvite && (
              <div style={{ marginTop: '12px', padding: '10px', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--line)' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--brand)', marginBottom: '4px' }}>✓ Invite Link Ready:</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    className="input-field"
                    value={generatedInvite.invite_url}
                    style={{ fontSize: '12px', flex: 1, fontFamily: 'monospace' }}
                  />
                  <button type="button" className="btn btn-soft btn-sm" onClick={copyInviteLink}>
                    {copied ? <Check size={14} color="var(--good)" /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      {/* TAB 2: CREATE PROJECT */}
      {tab === 'create' && (
        <form onSubmit={handleCreateProject} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label className="field">
              <span className="eyebrow">Company or Org Name</span>
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
              <span className="eyebrow">Project Name</span>
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
          <button className="btn btn-primary" type="submit" disabled={submitting || !orgName.trim() || !projectName.trim()} style={{ marginTop: '8px' }}>
            {submitting ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} Create Project
          </button>
        </form>
      )}

      {/* TAB 3: JOIN PROJECT */}
      {tab === 'join' && (
        <form onSubmit={handleJoinProject} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label className="field">
              <span className="eyebrow">Invite Link or Token</span>
              <input
                type="text"
                required
                className="input-field"
                placeholder="Paste full URL or token (e.g. 91a745c0-...)"
                value={inviteTokenOrUrl}
                onChange={(e) => setInviteTokenOrUrl(e.target.value)}
              />
            </label>
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting || !inviteTokenOrUrl.trim()} style={{ marginTop: '8px' }}>
            {submitting ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />} Accept & Join Project
          </button>
        </form>
      )}
    </Modal>
  );
}
