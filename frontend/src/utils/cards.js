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

export function normalize(card, source) {
  const hasQuiz = card.quiz && Array.isArray(card.quiz.options) && card.quiz.options.length > 1;
  return {
    id: String(card.id),
    // Teammate cards carry a plain-English title; otherwise fall back to the decision sentence.
    title: card.plain_title || card.decision || 'A change worth understanding',
    decision: card.decision || '',
    why: card.why || '',
    tip: card.mentor_tip || '',
    analogy: card.analogy || '',
    alternatives: Array.isArray(card.alternatives) ? card.alternatives : [],
    quiz: hasQuiz ? card.quiz : null,
    file: card.file || '',
    category: card.category || 'architecture',
    source, // 'mine' or a teammate's name
  };
}

// Builds the single list of lessons: your own work first, then each teammate's.
export function buildLessons(myCards, teamCards) {
  const mine = myCards.map((c) => normalize(c, 'mine'));
  const mineIds = new Set(mine.map((c) => c.id));
  const others = teamCards
    .filter((c) => c.author !== LOCAL_AUTHOR && !mineIds.has(String(c.id)))
    .map((c) => normalize(c, c.author || 'A teammate'));
  return [...mine, ...others];
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
