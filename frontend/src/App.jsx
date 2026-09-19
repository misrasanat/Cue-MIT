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
  Layers,
  Users,
  Send,
  MessageSquare,
  BookOpen
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001';

export default function App() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedDrawers, setExpandedDrawers] = useState({});
  const [quizAnswers, setQuizAnswers] = useState({});
  const [showStandup, setShowStandup] = useState(false);
  const [standupBullets, setStandupBullets] = useState([]);
  
  // Tab state: 'timeline' | 'team'
  const [activeTab, setActiveTab] = useState('timeline');
  const [teamQuestion, setTeamQuestion] = useState('');
  const [isAskingTeam, setIsAskingTeam] = useState(false);
  const [teamResponse, setTeamResponse] = useState(null);
  const [teamCards, setTeamCards] = useState([]);
  const [expandedTeamDrawers, setExpandedTeamDrawers] = useState({});
  const [expandedTeamCards, setExpandedTeamCards] = useState({});
  const [expandedSourceCardId, setExpandedSourceCardId] = useState(null);
  const [teamQuizAnswers, setTeamQuizAnswers] = useState({});

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
    fetchTeamCards();
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

  const fetchTeamCards = async () => {
    try {
      const res = await fetch(`${API_BASE}/team-cards`);
      if (res.ok) {
        const data = await res.json();
        setTeamCards(data);
      }
    } catch (e) {
      console.error('Failed to fetch team cards', e);
    }
  };

  const handleAskTeam = async (e, customQ) => {
    if (e && e.preventDefault) e.preventDefault();
    const q = customQ || teamQuestion;
    if (!q || !q.trim()) return;
    if (customQ) setTeamQuestion(customQ);
    setIsAskingTeam(true);
    setTeamResponse(null);
    try {
      const res = await fetch(`${API_BASE}/ask-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        setTeamResponse(data);
      }
    } catch (err) {
      console.error('Ask team error:', err);
    } finally {
      setIsAskingTeam(false);
    }
  };

  const toggleTeamDrawer = (id) => {
    setExpandedTeamDrawers(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleTeamCard = (id) => {
    setExpandedTeamCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSourceCard = (id) => {
    setExpandedSourceCardId(prev => (prev === id ? null : id));
  };

  const handleSelectTeamQuiz = (cardId, optionIndex) => {
    setTeamQuizAnswers(prev => ({ ...prev, [cardId]: optionIndex }));
  };

  const DEMO_QUESTIONS = [
    { label: "🚗 Why pause between payment retries?", q: "Why pause between payment retries?" },
    { label: "💳 How do we avoid double-charging?", q: "Why do we cache idempotency keys for 24 hours to prevent double billing?" },
    { label: "⚡ What if Stripe crashes?", q: "What is the payment circuit breaker for?" },
    { label: "❌ Which payment errors fail right away?", q: "How does Sam classify payment errors?" }
  ];

  const renderAnswerContent = (text) => {
    if (!text) return null;

    let mainText = text;
    let analogy = '';
    let tip = '';

    if (mainText.includes('\n\n💡 Rule of Thumb:')) {
      const parts = mainText.split('\n\n💡 Rule of Thumb:');
      mainText = parts[0];
      tip = parts[1].trim();
    }

    if (mainText.includes('\n\n🧩 In Simple Terms:')) {
      const parts = mainText.split('\n\n🧩 In Simple Terms:');
      mainText = parts[0];
      analogy = parts[1].trim();
    }

    const cleanRationale = mainText.replace(/^(Sam's Rationale:|Rationale:)\s*/i, '').trim();

    return (
      <div className="team-answer-body">
        <div className="team-answer-main">
          <span className="author-quote-label">Sam's Explanation:</span> {cleanRationale}
        </div>

        {analogy && (
          <div className="team-answer-analogy-box">
            <span className="analogy-badge">🧩 In Simple Terms</span>
            <span className="analogy-text">{analogy}</span>
          </div>
        )}

        {tip && (
          <div className="team-answer-tip-box">
            <span className="tip-badge">💡 Key Rule</span>
            <span className="tip-text">{tip}</span>
          </div>
        )}
      </div>
    );
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
            <div className="brand-subtitle">Plain-English Code Explainer</div>
          </div>
        </div>

        <div className="header-actions">
          <div className="status-badge" style={!apiKeyConfigured ? { background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.2)' } : {}}>
            <span className="pulse-dot" style={!apiKeyConfigured ? { background: '#f59e0b', boxShadow: '0 0 8px #f59e0b' } : {}}></span> 
            {apiKeyConfigured ? 'AI Explainer Active' : 'Demo Mode (Mock Data)'}
          </div>

          <button className="btn btn-secondary" style={{ borderColor: 'rgba(129, 140, 248, 0.4)', color: '#818cf8' }} onClick={() => setShowSessionsModal(true)} title="View background captured sessions">
            <Layers size={15} /> Sessions
          </button>

          <button className="btn btn-secondary" onClick={handleToggleStandup} title="Quick speaking points for team meetings">
            <ShieldCheck size={15} /> Meeting Cheat Sheet
          </button>

          <button className="btn btn-secondary" style={{ borderColor: 'rgba(99, 102, 241, 0.4)', background: 'rgba(99, 102, 241, 0.08)' }} onClick={() => setShowSetupModal(true)}>
            <Terminal size={15} className="text-indigo-400" /> Connect Terminal
          </button>

          <button className="btn btn-secondary" onClick={() => setShowAuthModal(true)}>
            {session ? <User size={15} className="text-indigo-400" /> : <LogIn size={15} />}
            {session ? session.user.email.split('@')[0] : 'Log In'}
          </button>

          <button className="btn btn-secondary" onClick={() => setShowSettings(true)} title="Settings">
            <Settings size={15} /> Settings
          </button>

          <button className="btn btn-ghost" style={{ borderColor: 'rgba(52, 211, 153, 0.2)', color: '#34d399' }} onClick={() => setShowDebugModal(true)} title="View background activity logs">
            <Activity size={15} />
          </button>

          <button className="btn btn-ghost" onClick={handleReset} title="Clear cards">
            <RotateCcw size={15} />
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="tab-nav">
        <button 
          className={`tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          <Sparkles size={15} /> Live Code Explainer
          {cards.length > 0 && <span className="tab-counter">{cards.length}</span>}
        </button>
        <button 
          className={`tab-btn ${activeTab === 'team' ? 'active' : ''}`}
          onClick={() => { setActiveTab('team'); fetchTeamCards(); }}
        >
          <Users size={15} /> Ask Teammates (Sam)
          <span className="tab-pill">Payment Cheat Sheet</span>
        </button>
      </div>

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

      {/* Active Tab View */}
      {activeTab === 'timeline' ? (
        <>
          {/* Standup Prep Banner */}
          {showStandup && (
            <div className="standup-banner">
              <div className="standup-header">
                <div className="standup-title">
                  <Zap size={18} /> Meeting Cheat Sheet (Standup Talking Points)
                </div>
                <button className="btn btn-ghost" onClick={() => setShowStandup(false)}>×</button>
              </div>
              <p className="standup-desc">Use these simple bullet points to explain what was built in team meetings:</p>
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
        </>
      ) : (
        <div className="team-pool-view">
          {/* Novice-Friendly Hero Banner */}
          <div className="team-hero">
            <div className="team-hero-header">
              <div className="team-hero-top-row">
                <h2 className="team-hero-title">
                  <Users size={18} className="text-indigo-400" />
                  <span>Ask Sam: Why was this code built this way?</span>
                </h2>
                <span className="team-hero-badge">
                  Teammate Cheat Sheet
                </span>
              </div>
              <p className="team-hero-desc">
                Don't know why a file exists or what an architecture pattern does? Ask in plain English and Cue will explain Sam's decisions without confusing developer jargon.
              </p>
            </div>

            {/* Chat / Query Input */}
            <form onSubmit={handleAskTeam} className="team-query-form">
              <div className="team-input-wrapper">
                <MessageSquare size={16} className="team-input-icon" />
                <input
                  type="text"
                  className="team-input-field"
                  placeholder="e.g. Why do we pause before retrying a payment?"
                  value={teamQuestion}
                  onChange={(e) => setTeamQuestion(e.target.value)}
                />
                <button 
                  type="submit" 
                  className="btn btn-primary team-submit-btn" 
                  disabled={isAskingTeam || !teamQuestion.trim()}
                >
                  {isAskingTeam ? (
                    <span>Explaining...</span>
                  ) : (
                    <>
                      <Send size={14} /> Ask Cue
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Beginner Quick Questions */}
            <div className="team-prompt-chips">
              <span className="chips-label">Try asking:</span>
              {DEMO_QUESTIONS.map((item, idx) => (
                <button 
                  key={idx}
                  type="button" 
                  className="prompt-chip" 
                  onClick={() => handleAskTeam(null, item.q)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Synthesized Answer Box */}
          {teamResponse && (
            <div className="team-answer-card">
              <div className="team-answer-header">
                <div className="team-answer-badge">
                  <Sparkles size={13} /> Plain-English Answer from Sam's Notes
                </div>
                {teamResponse.sources && (
                  <span className="sources-count-badge">
                    Grounded in {teamResponse.sources.length} Code Card{teamResponse.sources.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {renderAnswerContent(teamResponse.answer)}

              {/* Compact Referenced Source Citations */}
              {teamResponse.sources && teamResponse.sources.length > 0 && (
                <div className="team-sources-section">
                  <div className="sources-header-bar">
                    <span className="sources-label">
                      <BookOpen size={12} /> Source File:
                    </span>
                    <div className="sources-pills-list">
                      {teamResponse.sources.map((src) => {
                        const isSrcExpanded = expandedSourceCardId === src.id;
                        return (
                          <div key={src.id} className="compact-source-item">
                            <button 
                              type="button" 
                              className={`source-chip-btn ${isSrcExpanded ? 'active' : ''}`}
                              onClick={() => toggleSourceCard(src.id)}
                            >
                              <FileCode size={12} />
                              <span className="src-file">{src.file}</span>
                              <span className="src-author">({src.author || 'Sam'})</span>
                              <span className="src-arrow">{isSrcExpanded ? '▲ Hide Code Details' : '▼ View Code Details'}</span>
                            </button>
                            {isSrcExpanded && (
                              <div className="source-expanded-drawer">
                                <div className="source-drawer-row">
                                  <strong>Technical Decision:</strong> {src.decision}
                                </div>
                                <div className="source-drawer-row">
                                  <strong>Original Reason:</strong> {src.why}
                                </div>
                                {src.mentor_tip && (
                                  <div className="source-drawer-tip">
                                    💡 <strong>Rule:</strong> {src.mentor_tip}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Browse All Team Cards (Cheat Sheet) */}
          <div className="team-all-cards-section">
            <div className="team-all-cards-header">
              <div className="team-all-cards-title-row">
                <h3>
                  <BookOpen size={16} /> Sam's Codebase Cheat Sheet
                </h3>
                <span className="pool-count-pill">{teamCards.length} key concepts</span>
              </div>
              <span className="team-section-subtitle">
                Click any concept below to see what it does in simple terms:
              </span>
            </div>

            <div className="team-cards-list">
              {teamCards.map((card) => {
                const isCardExpanded = expandedTeamCards[card.id];
                const isTradeoffExpanded = expandedTeamDrawers[card.id];
                const selectedQuiz = teamQuizAnswers[card.id];
                const categoryClass = `cat-${card.category || 'architecture'}`;

                return (
                  <div key={card.id} className={`team-history-card ${isCardExpanded ? 'is-expanded' : 'is-collapsed'}`}>
                    {/* Compact Summary Header Row (Clickable) */}
                    <div 
                      className="team-card-summary-row"
                      onClick={() => toggleTeamCard(card.id)}
                    >
                      <div className="team-card-summary-left">
                        <span className={`category-chip ${categoryClass}`}>
                          {card.category || 'architecture'}
                        </span>
                        <span className="file-chip">
                          <FileCode size={12} /> {card.file}
                        </span>
                        <span className="team-card-decision-summary" title={card.plain_title || card.decision}>
                          {card.plain_title || card.decision}
                        </span>
                      </div>

                      <div className="team-card-summary-right">
                        <span className="author-chip compact">
                          <User size={11} /> {card.author || 'Sam'}
                        </span>
                        <span className="summary-expand-indicator">
                          {isCardExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </span>
                      </div>
                    </div>

                    {/* Detailed Body (Revealed on Click) */}
                    {isCardExpanded && (
                      <div className="team-card-expanded-body">
                        {/* Everyday Analogy if available */}
                        {card.analogy && (
                          <div className="card-analogy-box">
                            <span className="analogy-badge">🧩 In Simple Terms</span>
                            <span className="analogy-text">{card.analogy}</span>
                          </div>
                        )}

                        <div className="card-why">
                          <strong>Why Sam Built This:</strong> {card.why}
                        </div>

                        {card.mentor_tip && (
                          <div className="card-mentor-tip">
                            <span className="mentor-tip-badge">💡 Plain-English Rule</span>
                            <span className="mentor-tip-text">{card.mentor_tip}</span>
                          </div>
                        )}

                        <div className="card-technical-details">
                          <span className="tech-badge">Technical Decision:</span>
                          <span className="tech-text">{card.decision}</span>
                        </div>

                        {/* Tradeoffs Accordion */}
                        {card.alternatives && card.alternatives.length > 0 && (
                          <>
                            <button 
                              className="tradeoff-toggle"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTeamDrawer(card.id);
                              }}
                            >
                              <span>Other Ways Sam Could Have Done It ({card.alternatives.length})</span>
                              {isTradeoffExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </button>

                            {isTradeoffExpanded && (
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

                        {/* Interactive Comprehension Quiz */}
                        {card.quiz && (
                          <div className="quiz-container">
                            <div className="quiz-question">
                              <HelpCircle size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                              Quick Check: {card.quiz.question}
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
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectTeamQuiz(card.id, optIdx);
                                    }}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
