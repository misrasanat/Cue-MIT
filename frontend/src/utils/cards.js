// Turns raw backend cards into "lessons" the UI can teach from, in plain language.

const LOCAL_AUTHOR = 'You (Local Dev)';

// Category labels people can actually parse, instead of engineering jargon.
const FRIENDLY_CATEGORY = {
  architecture: 'How it’s organized',
  'data-structure': 'How data is kept',
  'api-design': 'How parts talk',
  security: 'Staying safe',
  performance: 'Keeping it fast',
};

export function friendlyCategory(category) {
  return FRIENDLY_CATEGORY[category] || FRIENDLY_CATEGORY.architecture;
}

export function baseName(path) {
  if (!path) return 'this change';
  return String(path).split(/[\\/]/).pop();
}

// Turns any path inside a sentence ("Updated src/users/dm/extra.py") into just its file name ("Updated extra.py").
export function tidyPaths(text) {
  if (!text) return text;
  return String(text).replace(/(?<![\w:./-])(?:~?\/)?(?:[\w.-]+\/)+([\w.-]+\.[A-Za-z0-9]+)/g, '$1');
}

export function normalize(card, source) {
  const hasQuiz = card.quiz && Array.isArray(card.quiz.options) && card.quiz.options.length > 1;
  return {
    id: String(card.id),
    // Teammate cards carry a plain-English title; otherwise fall back to the decision sentence.
    title: tidyPaths(card.plain_title || card.decision || 'A change worth understanding'),
    decision: tidyPaths(card.decision || ''),
    why: tidyPaths(card.why || ''),
    tip: card.mentor_tip || '',
    analogy: card.analogy || '',
    alternatives: Array.isArray(card.alternatives) ? card.alternatives : [],
    quiz: hasQuiz ? card.quiz : null,
    file: card.file || '',
    category: card.category || 'architecture',
    source, // 'mine' or a teammate's name
    authorId: card.user_id ? String(card.user_id) : '',
    time: Date.parse(card.timestamp) || 0, // 0 when the timestamp isn't a full date (cards made this session)
  };
}

// Mirrors the backend: 'dhweya.modi@outlook.com' -> 'Dhweya Modi'.
export function friendlyName(email) {
  if (!email || !String(email).includes('@')) return 'Teammate';
  const [local, domain] = String(email).split('@');
  if (domain.endsWith('team.internal') && local.startsWith('user-')) return 'Teammate';
  const words = local.split(/[._\-+]+/).map((w) => w.replace(/\d+$/, '')).filter(Boolean);
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'Teammate';
}

// Builds the single list of lessons. A project's cards include every teammate's, so each one is
// sorted into "yours" or a teammate's by who wrote it, not by which list it arrived in.
export function buildLessons(myCards, teamCards, meId) {
  const isMine = (c) => (c.user_id && meId ? c.user_id === meId : !c.author || c.author === LOCAL_AUTHOR);

  // The team copy carries the author details, so it wins when the same card is in both lists.
  const byId = new Map();
  [...myCards, ...teamCards].forEach((c) => {
    const id = String(c.id);
    byId.set(id, { ...(byId.get(id) || {}), ...c });
  });

  const all = [...byId.values()].map((c) => normalize(c, isMine(c) ? 'mine' : (c.author || 'A teammate')));
  // Your own work first, then teammates, newest first within each.
  return all.sort((a, b) => (a.source === 'mine' ? 0 : 1) - (b.source === 'mine' ? 0 : 1) || b.time - a.time);
}

export function sourceLabel(source) {
  return source === 'mine' ? 'Your work' : `${source}’s work`;
}

export function firstSentence(text) {
  const m = String(text || '').trim().match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : String(text || '')).trim();
}

// Fisher-Yates over indexes so the quiz options can be reshuffled without losing which one is correct.
export function shuffledOrder(n) {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// "5 min ago" style labels for live activity. Timestamps from the server carry a UTC offset.
export function timeAgo(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  const seconds = Math.max(0, (Date.now() - t) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function isLive(iso) {
  const t = Date.parse(iso);
  return Boolean(t) && Date.now() - t < 5 * 60 * 1000;
}

export function sourceName(source) {
  return source === 'agy_transcript' ? 'Antigravity' : 'Gemini CLI';
}
