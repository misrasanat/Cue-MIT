import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import AuthModal from './AuthModal';
import SetupGuideModal from './SetupGuideModal';
import DebugLogsModal from './DebugLogsModal';
import SessionsModal from './SessionsModal';
import { 
  Sparkles, 
  RotateCcw, 
  ChevronDown, 
  ChevronUp, 
  FileCode, 
  CheckCircle2, 
  XCircle, 
  ShieldCheck, 
  Zap, 
  HelpCircle,
  Play,
  Settings,
  Key,
  Save,
  Lock,
  User,
  LogIn,
  Terminal,
  Activity,
  Layers
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001';

export default function App() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDrawers, setExpandedDrawers] = useState({});
  const [quizAnswers, setQuizAnswers] = useState({});
  const [showStandup, setShowStandup] = useState(false);
  const [standupBullets, setStandupBullets] = useState([]);
  
  // Auth & User State
  const [session, setSession] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [showSessionsModal, setShowSessionsModal] = useState(false);

  // Settings & Per-user API key state
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('cue_gemini_api_key') || '');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Supabase Auth listener & Initial Poll
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetchCards();
    checkConfig();
    const interval = setInterval(fetchCards, 2000);
    return () => clearInterval(interval);
  }, [session]);

  const checkConfig = async () => {
    try {
      const storedKey = localStorage.getItem('cue_gemini_api_key');
      if (storedKey) {
        await fetch(`${API_BASE}/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: storedKey })
        });
      }
      const res = await fetch(`${API_BASE}/config`);
      if (res.ok) {
        const data = await res.json();
        setApiKeyConfigured(data.api_key_configured);
      }
    } catch (e) {
      console.error('Config fetch failed', e);
    }
  };

  const fetchCards = async () => {
    try {
      const headers = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`${API_BASE}/cards`, { headers });
      if (res.ok) {
        const data = await res.json();
        setCards(data);
      }
    } catch (e) {
      // Backend offline fallback or silent poll ignore
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApiKey = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('cue_gemini_api_key', apiKey);
        setApiKeyConfigured(data.api_key_configured);
        setSaveStatus(data.api_key_configured ? 'Saved & Connected!' : 'API Key Cleared');
        setTimeout(() => setSaveStatus(''), 3000);
      }
    } catch (e) {
      setSaveStatus('Error saving key');
    }
  };

  const handleReset = async () => {
    try {
      await fetch(`${API_BASE}/reset`, { method: 'POST' });
      setCards([]);
      setQuizAnswers({});
      setShowStandup(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleStandup = async () => {
    if (!showStandup) {
      try {
        const res = await fetch(`${API_BASE}/standup`);
        if (res.ok) {
          const data = await res.json();
          setStandupBullets(data.bullets || []);
        }
      } catch (e) {
        setStandupBullets([
          "Implemented background intent buffering.",
          "Configured fire-and-forget Gemini CLI hook script.",
          "Established live timeline card synthesis."
        ]);
      }
    }
    setShowStandup(!showStandup);
  };

  // Simulate a live event payload for local preview
  const handleSimulateEvent = async () => {
    try {
      // 1. Send update_topic intent
      await fetch(`${API_BASE}/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'sim_session',
          tool_name: 'update_topic',
          tool_input: {
            summary: 'Decoupled capture hook from main backend thread',
            strategic_intent: 'Ensure zero terminal latency during CLI code generation'
          }
        })
      });

      // 2. Send write_file tool edit
      await fetch(`${API_BASE}/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'sim_session',
          tool_name: 'write_file',
          tool_input: {
            file_path: 'backend/capture.py',
            content: ["import subprocess", "", "def send(payload):", "    subprocess.Popen([\"curl\", \"-d\", payload])", "    return None"].join(String.fromCharCode(10)),
          },
          timestamp: new Date().toLocaleTimeString()
        })
      });

      setShowSessionsModal(true);
    } catch (e) {
      console.error('Simulation error', e);
    }
  };

  const toggleDrawer = (id) => {
    setExpandedDrawers(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelectQuizOption = (cardId, optionIndex) => {
    setQuizAnswers(prev => ({ ...prev, [cardId]: optionIndex }));
  };

  return (
    <div className="app-container">
      {/* Glow Effects */}
      <div className="bg-glow-1"></div>
      <div className="bg-glow-2"></div>

      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-logo">C</div>
          <div>
            <div className="brand-title">Cue</div>
            <div className="brand-subtitle">Ambient Comprehension Companion</div>
          </div>
        </div>

        <div className="header-actions">
          <div className="status-badge" style={!apiKeyConfigured ? { background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.2)' } : {}}>
            <span className="pulse-dot" style={!apiKeyConfigured ? { background: '#f59e0b', boxShadow: '0 0 8px #f59e0b' } : {}}></span> 
            {apiKeyConfigured ? 'Gemini 2.0 Connected' : 'Mock Mode (Set API Key)'}
          </div>

          <button className="btn btn-secondary" style={{ borderColor: 'rgba(129, 140, 248, 0.4)', color: '#818cf8' }} onClick={() => setShowSessionsModal(true)}>
            <Layers size={16} /> Sessions
          </button>

          <button className="btn btn-secondary" style={{ borderColor: 'rgba(52, 211, 153, 0.3)', color: '#34d399' }} onClick={() => setShowDebugModal(true)}>
            <Activity size={16} /> Debug Stream
          </button>

          <button className="btn btn-secondary" style={{ borderColor: 'rgba(99, 102, 241, 0.4)', background: 'rgba(99, 102, 241, 0.08)' }} onClick={() => setShowSetupModal(true)}>
            <Terminal size={16} className="text-indigo-400" /> Connect CLI
          </button>

          <button className="btn btn-secondary" onClick={() => setShowAuthModal(true)}>
            {session ? <User size={16} className="text-indigo-400" /> : <LogIn size={16} />}
            {session ? session.user.email.split('@')[0] : 'Log In / Sign Up'}
          </button>

          <button className="btn btn-secondary" onClick={handleToggleStandup}>
            <ShieldCheck size={16} /> Standup Prep
          </button>

          <button className="btn btn-secondary" onClick={() => setShowSettings(true)} title="Settings">
            <Settings size={16} /> Settings
          </button>

          <button className="btn btn-ghost" onClick={handleReset} title="Reset timeline">
            <RotateCcw size={16} />
          </button>
        </div>
      </header>

      {/* Debug Stream Modal */}
      {showDebugModal && (
        <DebugLogsModal
          onClose={() => setShowDebugModal(false)}
        />
      )}

      {/* Sessions Modal: cards are generated from here, on demand */}
      {showSessionsModal && (
        <SessionsModal
          token={session?.access_token}
          apiKeyConfigured={apiKeyConfigured}
          onClose={() => setShowSessionsModal(false)}
          onGenerated={fetchCards}
        />
      )}

      {/* Setup Guide Modal */}
      {showSetupModal && (
        <SetupGuideModal
          user={session?.user}
          onClose={() => setShowSetupModal(false)}
        />
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          user={session?.user}
          onClose={() => setShowAuthModal(false)}
          onAuthSuccess={(newSession) => {
            setSession(newSession);
            setShowAuthModal(false);
          }}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <Settings size={20} className="text-indigo-400" /> User Settings
              </div>
              <button className="btn btn-ghost" onClick={() => setShowSettings(false)}>×</button>
            </div>

            <form onSubmit={handleSaveApiKey}>
              <div className="form-group">
                <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Key size={14} /> Model API Key Configuration
                </label>
                <div style={{ fontSize: '13px', color: 'var(--text-normal)', marginBottom: '12px', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {apiKeyConfigured ? (
                    <span style={{ color: '#34d399', fontWeight: '500' }}>✓ Server Model Connected (`GEMINI_API_KEY` active on backend)</span>
                  ) : (
                    <span style={{ color: '#fbbf24' }}>⚠️ Server Model Key missing. Set `GEMINI_API_KEY` in `backend/.env` or enter key below.</span>
                  )}
                </div>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Optional Override API Key (AIzaSy...)"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px', display: 'block' }}>
                  By default, Cue uses your central model key configured in <code>backend/.env</code>.
                </span>
              </div>

              {saveStatus && (
                <div style={{ fontSize: '13px', color: '#34d399', marginBottom: '14px', fontWeight: '600' }}>
                  ✓ {saveStatus}
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSettings(false)}>
                  Close
                </button>
                <button type="submit" className="btn btn-primary">
                  <Save size={14} /> Save Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Standup Prep Banner */}
      {showStandup && (
        <div className="standup-banner">
          <div className="standup-header">
            <div className="standup-title">
              <Zap size={18} /> Standup Defense Bullet Points
            </div>
            <button className="btn btn-ghost" onClick={() => setShowStandup(false)}>×</button>
          </div>
          <ul className="standup-bullets">
            {standupBullets.map((bullet, idx) => (
              <li key={idx} className="standup-bullet-item">
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Timeline Section */}
      {cards.length === 0 ? (
        <div className="empty-state">
          <Sparkles className="empty-icon" />
          <h2 className="empty-title">Awaiting Architectural Changes</h2>
          <p className="empty-desc">
            Cue logs what your AI agent does in the terminal, session by session. Open Sessions and click Generate Cards on any session to turn its changes into decision & tradeoff cards.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={handleSimulateEvent}>
              <Play size={14} /> Simulate Sample CLI Event
            </button>
            <button className="btn btn-secondary" onClick={() => setShowSessionsModal(true)}>
              <Layers size={14} /> Open Sessions
            </button>
            <button className="btn btn-secondary" onClick={() => setShowSettings(true)}>
              <Key size={14} /> Configure API Key
            </button>
          </div>
        </div>
      ) : (
        <div className="timeline">
          {cards.map((card) => {
            const isExpanded = expandedDrawers[card.id];
            const selectedQuiz = quizAnswers[card.id];
            const categoryClass = `cat-${card.category || 'architecture'}`;

            return (
              <div key={card.id} className="timeline-item">
                <div className="timeline-node">
                  <div className="timeline-node-inner"></div>
                </div>

                <div className="cue-card">
                  {/* Card Header Tags */}
                  <div className="card-top">
                    <div className="card-tags">
                      <span className={`category-chip ${categoryClass}`}>
                        {card.category || 'architecture'}
                      </span>
                      <span className="file-chip">
                        <FileCode size={13} /> {card.file || 'code change'}
                      </span>
                    </div>
                    {card.timestamp && (
                      <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                        {card.timestamp}
                      </span>
                    )}
                  </div>

                  {/* Core Decision & Why */}
                  <div className="card-decision">{card.decision}</div>
                  <div className="card-why">{card.why}</div>

                  {/* Intern Mentor Tip */}
                  {card.mentor_tip && (
                    <div className="card-mentor-tip">
                      <span className="mentor-tip-badge">💡 Mentor Tip for Interns</span>
                      <span className="mentor-tip-text">{card.mentor_tip}</span>
                    </div>
                  )}

                  {/* Tradeoffs Accordion / Drawer */}
                  {card.alternatives && card.alternatives.length > 0 && (
                    <>
                      <button 
                        className="tradeoff-toggle"
                        onClick={() => toggleDrawer(card.id)}
                      >
                        <span>Tradeoffs & Architectural Alternatives ({card.alternatives.length})</span>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {isExpanded && (
                        <div className="tradeoff-drawer">
                          {card.alternatives.map((alt, idx) => (
                            <div key={idx} className="alt-option-card">
                              <div className="alt-option-title">Option {idx + 1}: {alt.option}</div>
                              <div className="pros-cons-grid">
                                <ul className="pro-list">
                                  {alt.pros?.map((pro, pIdx) => (
                                    <li key={pIdx} className="pro-item">
                                      <CheckCircle2 size={13} /> {pro}
                                    </li>
                                  ))}
                                </ul>
                                <ul className="con-list">
                                  {alt.cons?.map((con, cIdx) => (
                                    <li key={cIdx} className="con-item">
                                      <XCircle size={13} /> {con}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Micro-Check Quiz */}
                  {card.quiz && (
                    <div className="quiz-container">
                      <div className="quiz-question">
                        <HelpCircle size={15} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                        Comprehension Check: {card.quiz.question}
                      </div>

                      <div className="quiz-options">
                        {card.quiz.options?.map((opt, optIdx) => {
                          const isSelected = selectedQuiz === optIdx;
                          const isCorrect = optIdx === card.quiz.correct_index;
                          let btnClass = "quiz-option-btn";

                          if (selectedQuiz !== undefined) {
                            if (isCorrect) btnClass += " correct";
                            else if (isSelected && !isCorrect) btnClass += " wrong";
                          }

                          return (
                            <button
                              key={optIdx}
                              className={btnClass}
                              disabled={selectedQuiz !== undefined}
                              onClick={() => handleSelectQuizOption(card.id, optIdx)}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
