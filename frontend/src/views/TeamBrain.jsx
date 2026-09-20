import { useMemo, useState } from 'react';
import { Send, Lightbulb, ArrowRight, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
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
  const suggestions = people.some((p) => p.name === 'Sam')
    ? SAM_QUESTIONS
    : teamLessons.slice(0, 3).map((l) => `What does ${baseName(l.file)} do, and why?`);
  const openLesson = (l) => onStart([l.id], statusOf(l.id) === 'new' ? 'learn' : 'review');

  // Teammates' coding sessions, shared live from their machines.
  const teamSessions = sessions.filter((s) => s.user_id !== meId);
  const liveNow = teamSessions.slice(0, 4);
  const personSessions = activePerson ? teamSessions.filter((s) => s.user_id === activePerson.key) : [];
  const sessionProps = { projectId, token, canGenerate: Boolean(token) && apiKeyConfigured, onGenerated };

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, project_id: projectId }),
      });
      if (!res.ok) throw new Error('bad response');
      setResponse(await res.json());
    } catch {
      setFailed(true);
    } finally {
      setAsking(false);
    }
  };

  const answer = response ? splitAnswer(response.answer) : null;
  const lessonFor = (id) => lessons.find((l) => l.id === String(id));

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
          <p className="answer-main">{answer.main}</p>
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
                const lesson = lessonFor(src.id);
                const isOpen = openSource === src.id;
                return (
                  <div key={src.id} className="source">
                    <button className="source-head" onClick={() => setOpenSource(isOpen ? null : src.id)} aria-expanded={isOpen}>
                      <span>
                        {lesson ? lesson.title : <>{src.author || 'A teammate'}’s note on <code>{baseName(src.file)}</code></>}
                      </span>
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {isOpen && (
                      <div className="source-body">
                        <p><strong>What they did:</strong> {src.decision}</p>
                        <p><strong>Why:</strong> {src.why}</p>
                        {lesson && (
                          <button className="btn btn-soft" onClick={() => onStart([lesson.id], statusOf(lesson.id) === 'new' ? 'learn' : 'review')}>
                            Turn this into a lesson <ArrowRight size={16} />
                          </button>
                        )}
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
