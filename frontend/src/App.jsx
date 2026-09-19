import { useState, useEffect, useMemo, useCallback } from 'react';
import { Home as HomeIcon, GraduationCap, Users, Settings as SettingsIcon } from 'lucide-react';
import { supabase } from './supabase';
import { API_BASE } from './utils/api';
import { buildLessons } from './utils/cards';
import { useProgress } from './utils/progress';
import Home from './views/Home';
import Learn from './views/Learn';
import TeamBrain from './views/TeamBrain';
import Lesson from './views/Lesson';
import SettingsModal from './modals/SettingsModal';
import SessionsModal from './modals/SessionsModal';
import AuthModal from './modals/AuthModal';
import SetupGuideModal from './modals/SetupGuideModal';
import DebugLogsModal from './modals/DebugLogsModal';

const NAV = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'learn', label: 'Learn', Icon: GraduationCap },
  { id: 'team', label: 'Team Brain', Icon: Users },
];

export default function App() {
  const [view, setView] = useState('home');
  const [modal, setModal] = useState(null); // 'settings' | 'sessions' | 'auth' | 'setup' | 'debug'
  const [run, setRun] = useState(null); // { ids, mode } while a lesson is in progress

  const [session, setSession] = useState(null);
  const [cards, setCards] = useState([]);
  const [teamCards, setTeamCards] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [online, setOnline] = useState(true);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);

  const progress = useProgress();
  const token = session?.access_token;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  const fetchCards = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/cards`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        setCards(await res.json());
        setOnline(true);
      }
    } catch {
      setOnline(false);
    }
  }, [token]);

  const fetchTeamCards = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/team-cards`);
      if (res.ok) setTeamCards(await res.json());
    } catch {
      // Offline is already surfaced by the cards poll.
    }
  }, []);

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

  const navigate = (id) => {
    setView(id);
    window.scrollTo({ top: 0 });
  };

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
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="brand-name">Cue</span>
        </div>

        <ul className="nav">
          {NAV.map(({ id, label, Icon }) => (
            <li key={id}>
              <button className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => navigate(id)} aria-current={view === id ? 'page' : undefined}>
                <Icon size={20} aria-hidden="true" />
                <span>{label}</span>
                {id === 'learn' && dueCount > 0 && <span className="badge" aria-label={`${dueCount} ready to review`}>{dueCount}</span>}
              </button>
            </li>
          ))}
          <li className="nav-spacer" aria-hidden="true" />
          <li>
            <button className="nav-item" onClick={() => setModal('settings')}>
              <SettingsIcon size={20} aria-hidden="true" />
              <span>{name ? name : 'Settings'}</span>
            </button>
          </li>
        </ul>
      </nav>

      <main className="main">
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
          <TeamBrain lessons={lessons} statusOf={progress.statusOf} onStart={startLessons} />
        )}
      </main>

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
      {modal === 'auth' && (
        <AuthModal
          user={session?.user}
          onClose={() => setModal(null)}
          onAuthSuccess={(next) => { setSession(next); setModal(null); }}
        />
      )}
      {modal === 'setup' && <SetupGuideModal user={session?.user} onClose={() => setModal(null)} />}
      {modal === 'debug' && <DebugLogsModal onClose={() => setModal(null)} />}
    </div>
  );
}
