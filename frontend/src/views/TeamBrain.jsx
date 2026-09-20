import { useEffect, useMemo, useState } from 'react';
import { Send, Lightbulb, ArrowRight, Loader2, ChevronDown, ChevronUp, Info } from 'lucide-react';
import LessonRow from '../components/LessonRow';
import TeamSession from '../components/TeamSession';
import { API_BASE } from '../utils/api';
import { baseName, friendlyName } from '../utils/cards';

const SAM_QUESTIONS = [
  'Why pause between payment retries?',
  'How do we avoid double-charging?',
  'What happens if the payment provider goes down?',
  'Which payment errors fail right away?',
];

// The backend marks the analogy and rule of thumb with emoji headings; peel those apart so we can style them.
function splitAnswer(text) {
  let main = text || '';
  let tip = '';
  let analogy = '';
  if (main.includes('\n\n\u{1F4A1} Rule of Thumb:')) {
    [main, tip] = main.split('\n\n\u{1F4A1} Rule of Thumb:');
  }
  if (main.includes('\n\n\u{1F9E9} In Simple Terms:')) {
    [main, analogy] = main.split('\n\n\u{1F9E9} In Simple Terms:');
  }
  main = main.replace(/^(.{1,60}?['’]s Rationale:|Rationale:)\s*/i, '').trim();
  return { main, analogy: analogy.trim(), tip: tip.trim() };
}

function CitedText({ text, sources, onCite }) {
  const known = new Set(sources.map((s) => s.n));
  return text.split(/(\[\d+\])/g).map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    if (m && known.has(Number(m[1]))) {
      return <button key={i} type="button" className="cite" onClick={() => onCite(Number(m[1]))} aria-label={`Source ${m[1]}`}>{m[1]}</button>;
    }
    return m ? null : <span key={i}>{part}</span>;
  });
}

export default function TeamBrain({
  lessons, statusOf, onStart, projectId, members = [], meId,
  sessions = [], sessionsReady = true, sessionsError = null, token, apiKeyConfigured = false, onGenerated = () => {},
}) {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [response, setResponse] = useState(null);
  const [failed, setFailed] = useState(false);
  const [openSource, setOpenSource] = useState(null);
  const [person, setPerson] = useState(null);
  const [llm, setLlm] = useState(null);

  // The AI spending limit, so people know when answers are paused instead of wondering why they got worse.
  const refreshLlm = () => fetch(`${API_BASE}/llm/status`).then((r) => (r.ok ? r.json() : null)).then(setLlm).catch(() => setLlm(null));
  useEffect(() => { refreshLlm(); }, []);

  // Everyone on the team, including people who haven't shared anything yet.
  const people = useMemo(() => {
    const map = new Map();
    const add = (key, name) => {
      if (!map.has(key)) map.set(key, { key, name, lessons: [] });
      return map.get(key);
    };
    members.filter((m) => !m.is_pending && m.user_id !== meId).forEach((m) => add(m.user_id, friendlyName(m.email)));
    lessons.filter((l) => l.source !== 'mine').forEach((l) => add(l.authorId || l.source, l.source).lessons.push(l));
    return [...map.values()];
  }, [members, lessons, meId]);

  const invited = members.filter((m) => m.is_pending);
  const teamLessons = people.flatMap((p) => p.lessons).sort((a, b) => b.time - a.time);
  const latest = teamLessons.slice(0, 4);
  const activePerson = people.find((p) => p.key === person) || people[0];
  const openLesson = (l) => onStart([l.id], statusOf(l.id) === 'new' ? 'learn' : 'review');

  // Teammates' coding sessions, shared live from their machines.
  const teamSessions = sessions.filter((s) => s.user_id !== meId);
  const liveNow = teamSessions.slice(0, 4);
  const personSessions = activePerson ? teamSessions.filter((s) => s.user_id === activePerson.key) : [];
  // Lessons for a teammate's session are written by the hosted backend, so ask it (not this computer) whether the model is connected.
  const sessionProps = { projectId, token, canGenerate: Boolean(token) && Boolean(llm?.configured), onGenerated };

  const recentFiles = [...new Set([...teamSessions.flatMap((s) => s.files), ...teamLessons.map((l) => l.file)]
    .filter(Boolean).map(baseName))].slice(0, 2);
  const suggestions = people.some((p) => p.name === 'Sam')
    ? SAM_QUESTIONS
    : [
      ...people.slice(0, 2).map((p) => `What has ${p.name.split(' ')[0]} been working on?`),
      ...recentFiles.map((f) => `What changed in ${f}, and why?`),
    ];

  const ask = async (q) => {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion(text);
    setAsking(true);
    setFailed(false);
    setResponse(null);
    setOpenSource(null);
    try {
      const res = await fetch(`${API_BASE}/ask-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ question: text, project_id: projectId }),
      });
      if (!res.ok) throw new Error('bad response');
      setResponse(await res.json());
      refreshLlm();
    } catch {
      setFailed(true);
    } finally {
      setAsking(false);
    }
  };

  const answer = response ? splitAnswer(response.answer) : null;
  const lessonFor = (id) => lessons.find((l) => l.id === String(id));
  const openCitation = (n) => {
    setOpenSource(n);
    setTimeout(() => document.getElementById(`source-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Team <span className="gradient-text">Brain</span></h1>
        <p className="muted">Ask about anything your teammates built. Answers come from their own notes, in plain English.</p>
      </header>

      <form className="ask-box" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input
          className="ask-input"
          type="text"
          placeholder="Ask anything, like “Why do we wait between retries?”"
          aria-label="Your question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={asking || !question.trim()}>
          {asking ? <Loader2 size={16} className="spin" /> : <Send size={16} />} {asking ? 'Thinking' : 'Ask'}
        </button>
      </form>

      {llm?.limit_hit && (
        <div className="notice notice-warn" role="alert">
          <Info size={18} aria-hidden="true" />
          <div>
            <strong>Smart answers are paused.</strong>
            <span>
              The team&rsquo;s ${llm.cap_usd} AI budget is used up, so Team Brain is answering from your notes without the AI writing them.
              {llm.alert_sent && (llm.email_configured ? ' The team has been emailed.' : ' No email was sent because no email account is set up yet (see the README).')}
            </span>
          </div>
        </div>
      )}
      {llm && !llm.limit_hit && llm.percent >= 80 && (
        <div className="notice" role="status">
          <Info size={18} aria-hidden="true" />
          <div><strong>The AI budget is {Math.round(llm.percent)}% used.</strong><span>${llm.spent_usd.toFixed(2)} of ${llm.cap_usd}. Smart answers pause automatically at the limit.</span></div>
        </div>
      )}
      {llm && !llm.configured && (
        <p className="muted small">Smart answers are off on this computer: {llm.reason} You&rsquo;ll get basic answers from your notes meanwhile.</p>
      )}

      {suggestions.length > 0 && !response && (
        <div className="chips" aria-label="Question ideas">
          {suggestions.map((s) => (
            <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>
          ))}
        </div>
      )}

      {failed && (
        <div className="notice notice-warn" role="alert">
          <div><strong>I couldn’t get an answer just now.</strong><span>Check that Cue’s helper is running, then try again.</span></div>
        </div>
      )}

      {answer && (
        <section className="answer" aria-live="polite">
          {response.mode !== 'none' && (
            <span className={`answer-badge ${response.mode === 'ai' ? 'ai' : ''}`}>
              {response.mode === 'ai' ? 'Smart answer' : 'Basic answer'}{response.cached ? ' \u00b7 saved' : ''}
            </span>
          )}
          {response.notice && (
            <div className="notice notice-warn"><Info size={18} aria-hidden="true" /><div><span>{response.notice}</span></div></div>
          )}
          <p className="answer-main"><CitedText text={answer.main} sources={response.sources || []} onCite={openCitation} /></p>
          {answer.analogy && (
            <aside className="callout callout-warm"><strong>In simple terms</strong><span>{answer.analogy}</span></aside>
          )}
          {answer.tip && (
            <aside className="callout callout-cool"><strong><Lightbulb size={15} aria-hidden="true" /> Worth remembering</strong><span>{answer.tip}</span></aside>
          )}

          {response.sources?.length > 0 && (
            <div className="sources">
              <span className="eyebrow">Where this comes from</span>
              {response.sources.map((src) => {
                const lesson = src.kind === 'card' ? lessonFor(src.id) : null;
                const live = src.kind !== 'card' ? sessions.find((x) => x.id === src.session_id && x.user_id === src.user_id) : null;
                const isOpen = openSource === src.n;
                const label = src.kind === 'card'
                  ? (lesson ? lesson.title : src.title)
                  : `${src.author}${src.when ? ` \u00b7 ${src.when}` : ''} \u00b7 ${src.file ? baseName(src.file) : src.title}`;
                return (
                  <div key={src.n} id={`source-${src.n}`} className="source">
                    <button className="source-head" onClick={() => setOpenSource(isOpen ? null : src.n)} aria-expanded={isOpen}>
                      <span><span className="source-n">{src.n}</span> {label}</span>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {isOpen && (
                      <div className="source-body">
                        <p><strong>{src.kind === 'card' ? 'What they did:' : 'Goal:'}</strong> {src.decision}</p>
                        {src.why && <p><strong>{src.kind === 'card' ? 'Why:' : 'Changes:'}</strong> {src.why}</p>}
                        {lesson && (
                          <button className="btn btn-soft" onClick={() => onStart([lesson.id], statusOf(lesson.id) === 'new' ? 'learn' : 'review')}>
                            Turn this into a lesson <ArrowRight size={16} />
                          </button>
                        )}
                        {live && <TeamSession session={live} showAuthor={false} {...sessionProps} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <button className="link-btn" onClick={() => { setResponse(null); setQuestion(''); }}>Ask something else</button>
        </section>
      )}

      {projectId && !sessionsReady && sessionsError && (
        <div className="notice notice-warn" role="alert">
          <div><strong>Live sessions aren&rsquo;t switched on yet.</strong><span>{sessionsError}</span></div>
        </div>
      )}

      {liveNow.length > 0 && (
        <section className="group">
          <div className="group-head"><h2>Live from your team</h2></div>
          <div className="rows">
            {liveNow.map((s) => <TeamSession key={`${s.user_id}-${s.id}`} session={s} {...sessionProps} />)}
          </div>
        </section>
      )}

      {latest.length > 0 && (
        <section className="group">
          <div className="group-head"><h2>Latest lessons from your team</h2></div>
          <div className="rows">
            {latest.map((l) => (
              <LessonRow key={l.id} lesson={l} status={statusOf(l.id)} onOpen={() => openLesson(l)} />
            ))}
          </div>
        </section>
      )}

      {people.length > 0 && (
        <section className="group">
          <div className="group-head"><h2>Browse by teammate</h2></div>
          <div className="chips" role="group" aria-label="Teammates">
            {people.map((p) => (
              <button key={p.key} className={`chip chip-person ${p.key === activePerson?.key ? 'on' : ''}`} onClick={() => setPerson(p.key)}>
                <span className="avatar" aria-hidden="true">{p.name[0]}</span>
                {p.name} <span className="count">{p.lessons.length}</span>
              </button>
            ))}
          </div>
          {personSessions.length > 0 && (
            <>
              <h3 className="subhead">Recent sessions</h3>
              <div className="rows">
                {personSessions.map((sess) => (
                  <TeamSession key={sess.id} session={sess} showAuthor={false} {...sessionProps} />
                ))}
              </div>
            </>
          )}
          {activePerson && activePerson.lessons.length > 0 && (
            <>
              {personSessions.length > 0 && <h3 className="subhead">Lessons</h3>}
              <div className="rows">
                {activePerson.lessons.map((l) => (
                  <LessonRow key={l.id} lesson={l} status={statusOf(l.id)} showSource={false} onOpen={() => openLesson(l)} />
                ))}
              </div>
            </>
          )}
          {activePerson && activePerson.lessons.length === 0 && personSessions.length === 0 && (
            <div className="empty empty-flat">
              <h3>Nothing from {activePerson.name} yet</h3>
              <p className="muted">
                Once {activePerson.name} runs <code>cue link</code> in a project folder and codes with Gemini CLI or Antigravity,
                their sessions show up here live.
              </p>
            </div>
          )}
        </section>
      )}

      {invited.length > 0 && (
        <p className="muted small">Invited, not joined yet: {invited.map((m) => m.email).join(', ')}</p>
      )}

      {people.length === 0 && !response && (
        <div className="empty">
          <h2>{projectId ? 'Just you so far' : 'No teammate notes yet'}</h2>
          <p className="muted">
            {projectId
              ? 'Invite a teammate from the Team menu at the top. Once they turn a session into lessons, it shows up here.'
              : 'When your teammates use Cue, what they built shows up here so you can ask about it.'}
          </p>
        </div>
      )}
    </div>
  );
}
