import { useEffect } from 'react';
import { Lightbulb, Scale, Check, ArrowRight, ArrowLeft, X } from 'lucide-react';

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
  close: {
    tagline: 'Understanding each other, faster.',
  },
  nextLabel: 'Next',
  backLabel: 'Back',
  skipLabel: 'Skip to dashboard',
};

// Panel order. The close panel (index 4, see CLOSE_PANEL in App.jsx) is only reached through the navbar's Resume button.
const LAST_LINEAR = 3;
const TOTAL = 5;
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
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIndex((i) => (i < LAST_LINEAR ? i + 1 : i));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setIndex, onExit]);

  const cls = (i) => `pitch-panel ${i === index ? 'is-active' : i < index ? 'is-past' : 'is-future'}`;
  const next = () => setIndex((i) => (i < LAST_LINEAR ? i + 1 : i));

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

      <section className={cls(2)} aria-hidden={index !== 2}>
        <Diagram />
        <p className="pitch-caption gradient-text">{COPY.idea.caption}</p>
        <p className="pitch-sub">{COPY.idea.note}</p>
      </section>

      <section className={cls(3)} aria-hidden={index !== 3}>
        <h1 className="pitch-hook">{COPY.live.title}</h1>
        <p className="pitch-sub">{COPY.live.sub}</p>
        <button className="btn btn-primary btn-lg pitch-exit" onClick={onExit} tabIndex={index === 3 ? 0 : -1}>
          {COPY.live.button} <ArrowRight size={18} aria-hidden="true" />
        </button>
      </section>

      <section className={cls(4)} aria-hidden={index !== 4}>
        <Logo large />
        <p className="pitch-sub">{COPY.close.tagline}</p>
      </section>

      <div className="pitch-footer">
        <div className="pitch-dots" aria-label={`Panel ${index + 1} of ${TOTAL}`}>
          {Array.from({ length: TOTAL }, (_, i) => <i key={i} className={i === index ? 'on' : ''} />)}
        </div>
        {index > 0 && index <= LAST_LINEAR && (
          <button className="btn btn-ghost pitch-back" onClick={() => setIndex((i) => Math.max(0, i - 1))}>
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

