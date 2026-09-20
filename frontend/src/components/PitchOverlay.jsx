import { useEffect, useState } from 'react';
import { Lightbulb, Scale, Check, ArrowRight, ArrowLeft, X, Terminal, Sparkles, UserPlus, Eye, Brain, Code } from 'lucide-react';

// ---- Pitch wording: tweak here before presenting -------------------------------------------
const COPY = {
  hook: {
    title: 'AI is making you and your team dumber.',
    sub: 'You ship code you never actually understood.',
  },
  what: [
    { key: 'why', Icon: Lightbulb, label: 'Why', note: 'The reason behind every AI edit.' },
    { key: 'tradeoffs', Icon: Scale, label: 'Trade-offs', note: 'What was chosen, and what was given up.' },
    { key: 'understood', Icon: Check, label: 'Understood', note: 'Quick checks prove it stuck.' },
  ],
  whatTitle: 'Cue turns AI-written code into understanding.',
  idea: {
    aloneLabel: 'alone',
    hubLabel: 'Cue',
    caption: 'A third brain for your team.',
    note: 'Everyone learns from each other\u2019s AI sessions, not just their own.',
  },
  live: {
    title: 'Watch it live.',
    sub: 'A real lesson, then a real Team Brain question.',
    button: 'Exit to Dashboard',
  },
  intro: {
    badge: 'INTRODUCING',
    tagline: 'Understanding each other better.',
  },
  muse: {
    title: 'Powered by Meta Muse.',
    sub: 'Every lesson and every Team Brain answer comes from the Meta Muse API.',
    inLabel: 'Your team\u2019s AI sessions',
    hub: 'Meta Muse',
    hubNote: 'Muse API',
    out: [
      { key: 'lessons', Icon: Lightbulb, label: 'Lessons', note: 'Why, trade-offs, and a quick check.' },
      { key: 'brain', Icon: Brain, label: 'Team Brain answers', note: 'Ask anything your team has built.' },
    ],
  },
  vision: {
    title: 'Where this goes.',
    todayLabel: 'Today',
    today: [
      { key: 'gemini', Icon: Sparkles, label: 'Gemini' },
      { key: 'agy', Icon: Terminal, label: 'Antigravity' },
    ],
    tomorrowLabel: 'Tomorrow',
    tomorrow: [
      { key: 'hire', Icon: UserPlus, label: 'Every new hire\u2019s first week', note: 'Ramp up on why the code is the way it is.' },
      { key: 'manager', Icon: Eye, label: 'Every manager', note: 'Finally sees where their team is really stuck.' },
      { key: 'knowledge', Icon: Brain, label: 'Every bit of knowledge', note: 'It used to walk out the door. Now it stays exactly where it belongs.' },
    ],
  },
  close: {
    tagline: 'Understanding each other better.',
  },
  nextLabel: 'Next',
  backLabel: 'Back',
  skipLabel: 'Skip to dashboard',
};

// Panels run in order; the last one (index 7) is the closing slide.
const LAST_LINEAR = 7;
const TOTAL = 8;
const IDEA_PANEL = 3; // the slide whose caption appears on the first Next
// ---------------------------------------------------------------------------------------------

function Logo({ large }) {
  return (
    <span className={`brand pitch-logo ${large ? 'pitch-logo-lg' : ''}`} aria-label="Cue">
      <span className="brand-mark" aria-hidden="true">C</span>
      <span className="brand-name">Cue</span>
    </span>
  );
}

function Person({ x, y }) {
  return (
    <g transform={`translate(${x} ${y})`} className="pitch-person">
      <circle cx="0" cy="-9" r="7" />
      <path d="M-13 14 C-13 2 -7 -1 0 -1 C7 -1 13 2 13 14 Z" />
    </g>
  );
}

function Diagram() {
  const hub = { x: 470, y: 130 };
  const team = [
    { x: 300, y: 40 },
    { x: 300, y: 110 },
    { x: 300, y: 180 },
    { x: 300, y: 250 },
  ];
  return (
    <svg className="pitch-diagram" viewBox="0 0 580 290" role="img" aria-label="One person alone versus a team connected through Cue">
      <g className="pitch-alone">
        <Person x={70} y={150} />
        <g transform="translate(100 88)">
          <path d="M0 0h44a8 8 0 0 1 8 8v24a8 8 0 0 1-8 8H16l-10 9v-9H0a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8z" className="pitch-bubble" />
          <circle cx="10" cy="20" r="2.5" className="pitch-bubble-dot" />
          <circle cx="22" cy="20" r="2.5" className="pitch-bubble-dot" />
          <circle cx="34" cy="20" r="2.5" className="pitch-bubble-dot" />
        </g>
        <text x="70" y="200" textAnchor="middle" className="pitch-faint">{COPY.idea.aloneLabel}</text>
      </g>

      {team.map((p) => (
        <line key={p.y} x1={p.x + 16} y1={p.y} x2={hub.x - 34} y2={hub.y} className="pitch-line" />
      ))}
      {team.map((p) => <Person key={`p${p.y}`} x={p.x} y={p.y} />)}

      <circle cx={hub.x} cy={hub.y} r="50" className="pitch-halo" />
      <circle cx={hub.x} cy={hub.y} r="30" className="pitch-hub" />
      <text x={hub.x} y={hub.y + 6} textAnchor="middle" className="pitch-hub-label">{COPY.idea.hubLabel}</text>
    </svg>
  );
}

export default function PitchOverlay({ index, setIndex, onExit }) {
  // On the "bigger idea" slide, the first Next reveals the caption; the second moves on.
  const [revealed, setRevealed] = useState(false);

  const next = () => {
    if (index === IDEA_PANEL && !revealed) setRevealed(true);
    else setIndex((i) => (i < LAST_LINEAR ? i + 1 : i));
  };
  const back = () => {
    if (index === IDEA_PANEL && revealed) setRevealed(false);
    else setIndex((i) => Math.max(0, i - 1));
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const cls = (i) => `pitch-panel ${i === index ? 'is-active' : i < index ? 'is-past' : 'is-future'}`;

  return (
    <div className="pitch" data-panel={index} role="dialog" aria-modal="true" aria-label="Cue pitch">
      <div className="pitch-corner"><Logo /></div>
      <button className="btn btn-ghost pitch-skip" onClick={onExit}>
        {COPY.skipLabel} <X size={16} aria-hidden="true" />
      </button>

      <section className={cls(0)} aria-hidden={index !== 0}>
        <h1 className="pitch-hook">{COPY.hook.title}</h1>
        <p className="pitch-sub">{COPY.hook.sub}</p>
      </section>

      <section className={cls(1)} aria-hidden={index !== 1}>
        <span className="eyebrow" style={{ letterSpacing: '0.14em', fontWeight: 600 }}>{COPY.intro.badge}</span>
        <Logo large />
        <p className="pitch-sub" style={{ fontSize: 'clamp(24px, 3vw, 36px)', color: 'var(--ink)', fontWeight: 500 }}>
          "{COPY.intro.tagline}"
        </p>
      </section>

      <section className={cls(2)} aria-hidden={index !== 2}>
        <h2 className="pitch-title">{COPY.whatTitle}</h2>
        <ul className="pitch-icons">
          {COPY.what.map(({ key, Icon, label, note }) => (
            <li key={key} className="pitch-icon-item">
              <span className="tile-icon pitch-icon"><Icon size={40} aria-hidden="true" /></span>
              <span className="pitch-icon-label">{label}</span>
              <span className="pitch-icon-note">{note}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={cls(3)} aria-hidden={index !== 3}>
        <Diagram />
        <div className={`pitch-reveal ${revealed ? 'is-shown' : ''}`} aria-hidden={!revealed}>
          <p className="pitch-caption gradient-text">{COPY.idea.caption}</p>
          <p className="pitch-sub">{COPY.idea.note}</p>
        </div>
      </section>

      <section className={cls(4)} aria-hidden={index !== 4}>
        <h1 className="pitch-hook">{COPY.live.title}</h1>
        <p className="pitch-sub">{COPY.live.sub}</p>
        <button className="btn btn-primary btn-lg pitch-exit" onClick={onExit} tabIndex={index === 4 ? 0 : -1}>
          {COPY.live.button} <ArrowRight size={18} aria-hidden="true" />
        </button>
      </section>

      <section className={cls(5)} aria-hidden={index !== 5}>
        <h2 className="pitch-title">{COPY.muse.title}</h2>
        <div className="pitch-vision">
          <div className="pitch-chip"><Code size={20} aria-hidden="true" /> {COPY.muse.inLabel}</div>
          <ArrowRight className="pitch-era-arrow" size={40} aria-hidden="true" />
          <div className="pitch-muse">
            <Sparkles size={34} aria-hidden="true" />
            <strong>{COPY.muse.hub}</strong>
            <span>{COPY.muse.hubNote}</span>
          </div>
          <ArrowRight className="pitch-era-arrow" size={40} aria-hidden="true" />
          <ul className="pitch-muse-out">
            {COPY.muse.out.map(({ key, Icon, label, note }) => (
              <li key={key} className="pitch-scope">
                <span className="tile-icon pitch-scope-icon"><Icon size={22} aria-hidden="true" /></span>
                <span className="pitch-scope-text"><strong>{label}</strong><span>{note}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="pitch-sub">{COPY.muse.sub}</p>
      </section>

      <section className={cls(6)} aria-hidden={index !== 6}>
        <h2 className="pitch-title">{COPY.vision.title}</h2>
        <div className="pitch-vision">
          <div className="pitch-era pitch-era-today">
            <span className="pitch-era-label">{COPY.vision.todayLabel}</span>
            <ul>
              {COPY.vision.today.map(({ key, Icon, label }) => (
                <li key={key} className="pitch-chip"><Icon size={20} aria-hidden="true" /> {label}</li>
              ))}
            </ul>
          </div>
          <ArrowRight className="pitch-era-arrow" size={40} aria-hidden="true" />
          <div className="pitch-era pitch-era-tomorrow">
            <span className="pitch-era-label">{COPY.vision.tomorrowLabel}</span>
            <ul>
              {COPY.vision.tomorrow.map(({ key, Icon, label, note }) => (
                <li key={key} className="pitch-scope">
                  <span className="tile-icon pitch-scope-icon"><Icon size={22} aria-hidden="true" /></span>
                  <span className="pitch-scope-text"><strong>{label}</strong><span>{note}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className={cls(7)} aria-hidden={index !== 7}>
        <Logo large />
        <p className="pitch-sub" style={{ fontSize: 'clamp(24px, 3vw, 36px)', color: 'var(--ink)', fontWeight: 500 }}>
          "{COPY.close.tagline}"
        </p>
      </section>

      <div className="pitch-footer">
        <div className="pitch-dots" aria-label={`Panel ${index + 1} of ${TOTAL}`}>
          {Array.from({ length: TOTAL }, (_, i) => <i key={i} className={i === index ? 'on' : ''} />)}
        </div>
        {index > 0 && (
          <button className="btn btn-ghost pitch-back" onClick={back}>
            <ArrowLeft size={16} aria-hidden="true" /> {COPY.backLabel}
          </button>
        )}
        {index < LAST_LINEAR && (
          <button className="btn btn-soft pitch-next" onClick={next}>
            {COPY.nextLabel} <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

