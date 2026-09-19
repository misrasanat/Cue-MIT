import { useMemo, useState } from 'react';
import { Send, Lightbulb, ArrowRight, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import LessonRow from '../components/LessonRow';
import { API_BASE } from '../utils/api';
import { baseName } from '../utils/cards';

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
  main = main.replace(/^(Sam's Rationale:|Rationale:)\s*/i, '').trim();
  return { main, analogy: analogy.trim(), tip: tip.trim() };
}

export default function TeamBrain({ lessons, statusOf, onStart, projectId }) {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [response, setResponse] = useState(null);
  const [failed, setFailed] = useState(false);
  const [openSource, setOpenSource] = useState(null);
  const [person, setPerson] = useState(null);

  const teammates = useMemo(() => {
    const map = new Map();
    lessons.filter((l) => l.source !== 'mine').forEach((l) => {
      if (!map.has(l.source)) map.set(l.source, []);
      map.get(l.source).push(l);
    });
    return map;
  }, [lessons]);

  const names = [...teammates.keys()];
  const activePerson = person && teammates.has(person) ? person : names[0];
  const suggestions = teammates.has('Sam')
    ? SAM_QUESTIONS
    : [...teammates.values()].flat().slice(0, 3).map((l) => `What does ${baseName(l.file)} do, and why?`);

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

      {names.length > 0 && (
        <section className="group">
          <div className="group-head"><h2>Browse by teammate</h2></div>
          <div className="chips" role="group" aria-label="Teammates">
            {names.map((n) => (
              <button key={n} className={`chip chip-person ${n === activePerson ? 'on' : ''}`} onClick={() => setPerson(n)}>
                <span className="avatar" aria-hidden="true">{n[0]}</span>
                {n} <span className="count">{teammates.get(n).length}</span>
              </button>
            ))}
          </div>
          <div className="rows">
            {(teammates.get(activePerson) || []).map((l) => (
              <LessonRow
                key={l.id}
                lesson={l}
                status={statusOf(l.id)}
                showSource={false}
                onOpen={() => onStart([l.id], statusOf(l.id) === 'new' ? 'learn' : 'review')}
              />
            ))}
          </div>
        </section>
      )}

      {names.length === 0 && !response && (
        <div className="empty">
          <h2>No teammate notes yet</h2>
          <p className="muted">When your teammates use Cue, what they built shows up here so you can ask about it.</p>
        </div>
      )}
    </div>
  );
}
