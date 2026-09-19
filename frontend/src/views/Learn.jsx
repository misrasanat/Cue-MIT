import { useState } from 'react';
import { ArrowRight, Layers } from 'lucide-react';
import LessonRow from '../components/LessonRow';
import { sourceLabel } from '../utils/cards';

export default function Learn({ lessons, statusOf, onStart, onOpenSessions }) {
  const [filter, setFilter] = useState('all');

  const sources = [...new Set(lessons.map((l) => l.source))];
  const shown = filter === 'all' ? lessons : lessons.filter((l) => l.source === filter);

  const due = shown.filter((l) => statusOf(l.id) === 'due');
  const fresh = shown.filter((l) => statusOf(l.id) === 'new');
  const rest = shown.filter((l) => ['learning', 'solid'].includes(statusOf(l.id)));

  const open = (lesson) => onStart([lesson.id], statusOf(lesson.id) === 'new' ? 'learn' : 'review');

  return (
    <div className="page">
      <header className="page-head">
        <h1>Learn</h1>
        <p className="muted">Short lessons, one idea at a time. Pick anything that looks interesting.</p>
      </header>

      {lessons.length === 0 ? (
        <div className="empty">
          <h2>No lessons yet</h2>
          <p className="muted">Lessons are made from your coding sessions. Once you’ve coded with your assistant, turn that work into lessons here.</p>
          <button className="btn btn-primary" onClick={onOpenSessions}><Layers size={16} /> Open my sessions</button>
        </div>
      ) : (
        <>
          {sources.length > 1 && (
            <div className="chips" role="group" aria-label="Filter lessons">
              <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>Everything</button>
              {sources.map((s) => (
                <button key={s} className={`chip ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>{sourceLabel(s)}</button>
              ))}
            </div>
          )}

          {due.length > 0 && (
            <section className="group">
              <div className="group-head">
                <h2>Ready to review <span className="count">{due.length}</span></h2>
                <button className="btn btn-soft" onClick={() => onStart(due.map((l) => l.id).slice(0, 5), 'review')}>
                  Review them <ArrowRight size={16} />
                </button>
              </div>
              <div className="rows">
                {due.map((l) => <LessonRow key={l.id} lesson={l} status="due" onOpen={() => open(l)} />)}
              </div>
            </section>
          )}

          {fresh.length > 0 && (
            <section className="group">
              <div className="group-head"><h2>New to you <span className="count">{fresh.length}</span></h2></div>
              <div className="rows">
                {fresh.map((l) => <LessonRow key={l.id} lesson={l} status="new" onOpen={() => open(l)} />)}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section className="group">
              <div className="group-head"><h2>Already learning <span className="count">{rest.length}</span></h2></div>
              <div className="rows">
                {rest.map((l) => <LessonRow key={l.id} lesson={l} status={statusOf(l.id)} onOpen={() => open(l)} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
