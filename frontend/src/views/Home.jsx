import { ArrowRight, BookOpen, Users, Layers, WifiOff, Sparkles } from 'lucide-react';
import ProgressRing from '../components/ProgressRing';

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

export default function Home({
  name, lessons, statusOf, pendingSessions, apiKeyConfigured, online,
  onNavigate, onStart, onOpenSessions, onOpenSetup, onOpenSettings,
}) {
  const due = lessons.filter((l) => statusOf(l.id) === 'due');
  const fresh = lessons.filter((l) => statusOf(l.id) === 'new');
  const learned = lessons.filter((l) => statusOf(l.id) !== 'new').length;
  const solid = lessons.filter((l) => statusOf(l.id) === 'solid').length;
  const teammates = new Set(lessons.filter((l) => l.source !== 'mine').map((l) => l.source));

  let hero;
  if (lessons.length === 0) {
    hero = (
      <section className="hero hero-start">
        <h1>Let’s get you started</h1>
        <p className="lede">Cue watches what your AI coding assistant changes and turns it into short lessons, so you actually understand your own codebase.</p>
        <ol className="steps">
          <li><span>1</span> Connect your terminal <button className="link-btn" onClick={onOpenSetup}>Show me how</button></li>
          <li><span>2</span> Code the way you normally do</li>
          <li><span>3</span> Come back and turn that work into lessons <button className="link-btn" onClick={onOpenSessions}>Open my sessions</button></li>
        </ol>
      </section>
    );
  } else if (due.length > 0) {
    hero = (
      <section className="hero">
        <span className="eyebrow">Quick review</span>
        <h1>{due.length === 1 ? 'One idea is ready to revisit' : `${due.length} ideas are ready to revisit`}</h1>
        <p className="lede">About {Math.max(1, Math.round(due.length * 0.75))} min. Coming back to an idea just as it starts to fade is how it sticks for good.</p>
        <button className="btn btn-primary btn-lg" onClick={() => onStart(due.map((l) => l.id).slice(0, 5), 'review')}>
          Start review <ArrowRight size={18} />
        </button>
      </section>
    );
  } else if (fresh.length > 0) {
    const next = fresh.slice(0, 3);
    hero = (
      <section className="hero">
        <span className="eyebrow">Up next</span>
        <h1>{next[0].title}</h1>
        <p className="lede">A short lesson, a quick check, then explain it in your own words. Under three minutes.</p>
        <button className="btn btn-primary btn-lg" onClick={() => onStart(next.map((l) => l.id), 'learn')}>
          Start learning <ArrowRight size={18} />
        </button>
      </section>
    );
  } else {
    hero = (
      <section className="hero">
        <span className="eyebrow">All caught up</span>
        <h1>Nothing due right now</h1>
        <p className="lede">Nice work. Everything you’ve learned is scheduled to come back at the right moment. Meanwhile, ask the team brain something you’ve wondered about.</p>
        <button className="btn btn-primary btn-lg" onClick={() => onNavigate('team')}>
          Ask the team brain <ArrowRight size={18} />
        </button>
      </section>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="greeting">{greeting(name)}</h1>
        <p className="muted">Here’s where you are today.</p>
      </header>

      {!online && (
        <div className="notice notice-warn" role="alert">
          <WifiOff size={18} aria-hidden="true" />
          <div>
            <strong>Cue can’t reach its helper right now.</strong>
            <span>Start it with <code>python server.py</code> in the backend folder, then this page will fill in on its own.</span>
          </div>
        </div>
      )}

      {hero}

      <div className="tiles">
        <section className="tile tile-progress">
          <ProgressRing value={learned} total={lessons.length} />
          <div>
            <h2>Your progress</h2>
            <p className="muted">
              {lessons.length === 0
                ? 'Your first lesson will show up here.'
                : solid > 0
                  ? `${solid} ${solid === 1 ? 'idea feels' : 'ideas feel'} solid.`
                  : 'Each idea you review gets a little more solid.'}
            </p>
          </div>
        </section>

        <section className="tile">
          <BookOpen size={22} className="tile-icon" aria-hidden="true" />
          <h2>Your recent work</h2>
          <p className="muted">
            {pendingSessions > 0
              ? `${pendingSessions} coding ${pendingSessions === 1 ? 'session hasn’t' : 'sessions haven’t'} been turned into lessons yet.`
              : 'When you code with your assistant, Cue turns what changed into lessons.'}
          </p>
          <button className="btn btn-soft" onClick={onOpenSessions}><Layers size={16} /> {pendingSessions > 0 ? 'Make lessons' : 'See sessions'}</button>
        </section>

        <section className="tile">
          <Users size={22} className="tile-icon" aria-hidden="true" />
          <h2>Catch up on your team</h2>
          <p className="muted">
            {teammates.size > 0
              ? `Learn what ${[...teammates].slice(0, 2).join(' and ')} built, or just ask a question.`
              : 'Ask about what your teammates built, in plain English.'}
          </p>
          <button className="btn btn-soft" onClick={() => onNavigate('team')}><Users size={16} /> Open Team Brain</button>
        </section>
      </div>

      {!apiKeyConfigured && (
        <div className="notice">
          <Sparkles size={18} aria-hidden="true" />
          <div>
            <strong>You’re seeing sample explanations.</strong>
            <span>Add an AI key to get lessons written specifically about your code. <button className="link-btn" onClick={onOpenSettings}>Open settings</button></span>
          </div>
        </div>
      )}
    </div>
  );
}
