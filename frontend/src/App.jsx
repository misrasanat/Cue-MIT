import { useState, useEffect, useMemo, useCallback } from 'react';
import { Home as HomeIcon, GraduationCap, Users, Settings as SettingsIcon, Building2, Users as UsersIcon } from 'lucide-react';
import { supabase } from './supabase';
import { API_BASE } from './utils/api';
import { buildLessons } from './utils/cards';
import { useProgress } from './utils/progress';
import Landing from './views/Landing';
import Home from './views/Home';
import Learn from './views/Learn';
import TeamBrain from './views/TeamBrain';
import Lesson from './views/Lesson';
import ProjectOnboarding from './views/ProjectOnboarding';
import SettingsModal from './modals/SettingsModal';
import SessionsModal from './modals/SessionsModal';
import AuthModal from './modals/AuthModal';
import SetupGuideModal from './modals/SetupGuideModal';
import DebugLogsModal from './modals/DebugLogsModal';
import ProjectModal from './modals/ProjectModal';

const NAV = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'learn', label: 'Learn', Icon: GraduationCap },
  { id: 'team', label: 'Team Brain', Icon: Users },
];

export default function App() {
  const [view, setView] = useState('home');
  const [modal, setModal] = useState(null); // 'settings' | 'sessions' | 'auth' | 'setup' | 'debug' | 'project'
  const [run, setRun] = useState(null); // { ids, mode } while a lesson is in progress

  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  // Clicking the logo inside the app shows the welcome page again.
  const [showLanding, setShowLanding] = useState(false);
  // "Try the demo" lets someone in without an account; remembered so a refresh doesn't bounce them out.
  const [guest, setGuest] = useState(() => {
    try { return localStorage.getItem('cue_guest') === '1'; } catch { return false; }
  });

  // Projects state
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [cards, setCards] = useState([]);
  const [teamCards, setTeamCards] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [online, setOnline] = useState(true);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);

  const progress = useProgress();
  const token = session?.access_token;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Check for invite token in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('token');
    if (inviteToken) {
      setModal('project');
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    if (!session?.user) {
      setProjects([]);
      setActiveProject(null);
      return;
    }
    setLoadingProjects(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/user/projects?user_id=${session.user.id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        if (data.length > 0) {
          setActiveProject((prev) => {
            const found = data.find((p) => p.id === prev?.id);
            return found || data[0];
          });
        } else {
          setActiveProject(null);
        }
      }
    } catch {
      // offline
    } finally {
      setLoadingProjects(false);
    }
  }, [session?.user, token]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const fetchCards = useCallback(async () => {
    try {
      const url = activeProject?.id
        ? `${API_BASE}/cards?project_id=${activeProject.id}`
        : `${API_BASE}/cards`;
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        setCards(await res.json());
        setOnline(true);
      }
    } catch {
      setOnline(false);
    }
  }, [token, activeProject?.id]);

  const fetchTeamCards = useCallback(async () => {
    try {
      const url = activeProject?.id
        ? `${API_BASE}/team-cards?project_id=${activeProject.id}`
        : `${API_BASE}/team-cards`;
      const res = await fetch(url);
      if (res.ok) setTeamCards(await res.json());
    } catch {
      // Offline is already surfaced by the cards poll.
    }
  }, [activeProject?.id]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions`);
      if (res.ok) setSessions(await res.json());
    } catch {
      // Same as above.
    }
  }, []);

  const checkConfig = useCallback(async () => {
    try {
      // Re-send a locally saved key in case the backend restarted since it was entered.
      const stored = localStorage.getItem('cue_gemini_api_key');
      if (stored) {
        await fetch(`${API_BASE}/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: stored }),
        });
      }
      const res = await fetch(`${API_BASE}/config`);
      if (res.ok) setApiKeyConfigured((await res.json()).api_key_configured);
    } catch {
      // Backend offline.
    }
  }, []);

  useEffect(() => {
    checkConfig();
  }, [checkConfig]);

  // Poll gently, and only while the tab is actually being looked at.
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      fetchCards();
      fetchTeamCards();
      fetchSessions();
    };
    tick();
    const interval = setInterval(tick, 6000);
    return () => clearInterval(interval);
  }, [fetchCards, fetchTeamCards, fetchSessions]);

  const lessons = useMemo(() => buildLessons(cards, teamCards), [cards, teamCards]);
  const pendingSessions = sessions.filter((s) => s.edit_count > 0 && !(s.cards_generated > 0)).length;
  const dueCount = lessons.filter((l) => progress.statusOf(l.id) === 'due').length;
  const name = session?.user?.email?.split('@')[0];

  const startLessons = (ids, mode) => {
    const queue = ids.map((id) => lessons.find((l) => l.id === id)).filter(Boolean);
    if (queue.length > 0) setRun({ queue, mode });
  };

  const startOver = async () => {
    try {
      await fetch(`${API_BASE}/reset`, { method: 'POST' });
    } catch {
      // Local progress still gets cleared below.
    }
    progress.clear();
    setCards([]);
    setSessions([]);
  };

  // Sends a small made-up edit through the real capture pipeline so a new user can try Cue without a terminal.
  const simulateSession = async () => {
    const post = (body) => fetch(`${API_BASE}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(activeProject?.id ? { 'X-Project-Id': activeProject.id } : {})
      },
      body: JSON.stringify({
        ...body,
        ...(activeProject?.id ? { project_id: activeProject.id } : {})
      }),
    });
    try {
      await post({
        session_id: 'sim_session',
        tool_name: 'update_topic',
        tool_input: {
          summary: 'Decoupled capture hook from main backend thread',
          strategic_intent: 'Ensure zero terminal latency during CLI code generation',
        },
      });
      await post({
        session_id: 'sim_session',
        tool_name: 'write_file',
        tool_input: {
          file_path: 'backend/capture.py',
          content: ['import subprocess', '', 'def send(payload):', '    subprocess.Popen(["curl", "-d", payload])', '    return None'].join('\n'),
        },
        timestamp: new Date().toLocaleTimeString(),
      });
      fetchSessions();
    } catch {
      // Offline: the sessions list will keep showing its empty state.
    }
  };

  const openAuth = (mode) => {
    setAuthMode(mode);
    setModal('auth');
  };

  const enterGuest = () => {
    setShowLanding(false);
    setGuest(true);
    try { localStorage.setItem('cue_guest', '1'); } catch { /* still works for this visit */ }
  };

  const handleAuthChange = (next) => {
    setSession(next);
    setShowLanding(false);
    if (!next) {
      // Signing out returns to the welcome page.
      setGuest(false);
      try { localStorage.removeItem('cue_guest'); } catch { /* nothing to clear */ }
      setView('home');
    }
    setModal(null);
  };

  const navigate = (id) => {
    setView(id);
    window.scrollTo({ top: 0 });
  };

  const authModal = modal === 'auth' && (
    <AuthModal
      user={session?.user}
      startInSignUp={authMode === 'signup'}
      onClose={() => setModal(null)}
      onAuthSuccess={handleAuthChange}
    />
  );

  // Wait for the saved session to load so a signed-in user never sees the welcome page flash by.
  if (!authReady) return null;

  if ((!session && !guest) || showLanding) {
    return (
      <>
        <Landing
          signedIn={Boolean(session || guest)}
          onOpenApp={() => setShowLanding(false)}
          onSignUp={() => openAuth('signup')}
          onLogIn={() => openAuth('signin')}
          onGuest={enterGuest}
        />
        {authModal}
      </>
    );
  }

  if (run) {
    return (
      <Lesson
        queue={run.queue}
        mode={run.mode}
        progress={progress}
        onExit={() => setRun(null)}
      />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-grow">
            <button className="brand brand-btn" onClick={() => { setShowLanding(true); window.scrollTo({ top: 0 }); }} aria-label="Cue welcome page">
              <span className="brand-mark" aria-hidden="true">C</span>
              <span className="brand-name">Cue</span>
            </button>
          </div>

          <nav aria-label="Main">
            <ul className="nav">
              {NAV.map(({ id, label, Icon }) => (
                <li key={id}>
                  <button className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => navigate(id)} aria-current={view === id ? 'page' : undefined}>
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                    {id === 'learn' && dueCount > 0 && <span className="badge" aria-label={`${dueCount} ready to review`}>{dueCount}</span>}
                  </button>
                </li>
              ))}
              {session && (
                <li>
                  <button className="nav-item" onClick={() => setModal('project')} aria-label="Switch or manage project">
                    <Building2 size={18} aria-hidden="true" />
                    <span>{activeProject ? activeProject.name : 'Projects'}</span>
                  </button>
                </li>
              )}
            </ul>
          </nav>

          <div className="topbar-end">
            {session && activeProject && (
              <button className="btn btn-soft btn-sm" onClick={() => setModal('project')}>
                <UsersIcon size={14} /> Team ({projects.length > 0 ? activeProject.name : '0'})
              </button>
            )}
            <button className="user-btn" onClick={() => setModal('settings')} aria-label="Settings">
              <span className="user-avatar" aria-hidden="true">{name ? name[0].toUpperCase() : <SettingsIcon size={16} />}</span>
              <span className="user-name">{name || 'Settings'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        {/* Project Header Bar for logged-in users with an active project */}
        {session && activeProject && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 24px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', marginBottom: '16px', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge" style={{ background: 'var(--brand-soft)', color: 'var(--brand)', fontWeight: 700, fontSize: '11px' }}>PROJECT</span>
              <button
                className="link-btn"
                style={{ fontWeight: 700, fontSize: '14.5px', color: 'var(--ink)' }}
                onClick={() => setModal('project')}
              >
                {activeProject.name} ▾
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-soft btn-sm" onClick={() => setModal('project')}>
                <UsersIcon size={14} /> Team & Invites
              </button>
            </div>
          </div>
        )}

        {/* If logged in but has no project yet, show onboarding */}
        {session?.user && !loadingProjects && projects.length === 0 ? (
          <ProjectOnboarding
            user={session.user}
            token={token}
            onProjectCreated={(newProj) => {
              fetchProjects();
              if (newProj) setActiveProject(newProj);
            }}
          />
        ) : (
          <>
            {view === 'home' && (
              <Home
                name={name}
                lessons={lessons}
                statusOf={progress.statusOf}
                pendingSessions={pendingSessions}
                apiKeyConfigured={apiKeyConfigured}
                online={online}
                onNavigate={navigate}
                onStart={startLessons}
                onOpenSessions={() => setModal('sessions')}
                onOpenSetup={() => setModal('setup')}
                onOpenSettings={() => setModal('settings')}
              />
            )}
            {view === 'learn' && (
              <Learn
                lessons={lessons}
                statusOf={progress.statusOf}
                onStart={startLessons}
                onOpenSessions={() => setModal('sessions')}
              />
            )}
            {view === 'team' && (
              <TeamBrain
                lessons={lessons}
                statusOf={progress.statusOf}
                onStart={startLessons}
                projectId={activeProject?.id}
              />
            )}
          </>
        )}
      </main>

      {modal === 'project' && (
        <ProjectModal
          user={session?.user}
          token={token}
          projects={projects}
          activeProject={activeProject}
          onSelectProject={(p) => setActiveProject(p)}
          onProjectsChanged={(newProj) => {
            fetchProjects();
            if (newProj) setActiveProject(newProj);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'settings' && (
        <SettingsModal
          session={session}
          apiKeyConfigured={apiKeyConfigured}
          onKeyChanged={setApiKeyConfigured}
          onOpen={setModal}
          onStartOver={startOver}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'sessions' && (
        <SessionsModal
          token={token}
          apiKeyConfigured={apiKeyConfigured}
          onClose={() => setModal(null)}
          onGenerated={() => { fetchCards(); fetchTeamCards(); fetchSessions(); }}
          onSimulate={simulateSession}
        />
      )}
      {authModal}
      {modal === 'setup' && <SetupGuideModal user={session?.user} onClose={() => setModal(null)} />}
      {modal === 'debug' && <DebugLogsModal onClose={() => setModal(null)} />}
    </div>
  );
}
