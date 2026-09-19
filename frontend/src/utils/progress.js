import { useState, useCallback } from 'react';

// Spaced repetition, kept deliberately simple: each lesson sits in a "box" and comes back
// after a longer gap every time you remember it. Forgetting sends it back to box 0.
const KEY = 'cue_progress_v1';
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const GAPS = [10 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, 21 * DAY, 45 * DAY];
export const SOLID_BOX = 3;

export const RATING = { NOT_YET: 0, ALMOST: 1, GOT_IT: 2 };

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function save(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Private mode or full storage: progress just won't persist this time.
  }
}

// quiz right (0/1) + how well you explained it (0-2) = 0..3
export function nextBox(box, quizRight, rating) {
  const score = (quizRight ? 1 : 0) + rating;
  if (score >= 3) return Math.min(box + 1, GAPS.length - 1);
  if (score === 2) return Math.max(box, 1);
  return 0;
}

export function describeGap(box) {
  const ms = GAPS[box];
  if (ms < DAY) return 'a little later today';
  const days = Math.round(ms / DAY);
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  return `in about ${Math.round(days / 7)} weeks`;
}

export function useProgress() {
  const [store, setStore] = useState(load);

  const record = useCallback((id, { quizRight, rating, note }) => {
    setStore((prev) => {
      const cur = prev[id] || { box: 0, seen: 0 };
      const box = nextBox(cur.box, quizRight, rating);
      const next = {
        ...prev,
        [id]: {
          box,
          due: Date.now() + GAPS[box],
          seen: cur.seen + 1,
          last: Date.now(),
          note: note || cur.note || '',
        },
      };
      save(next);
      return next;
    });
    return nextBox((store[id] || { box: 0 }).box, quizRight, rating);
  }, [store]);

  // 'new' | 'due' | 'learning' | 'solid'
  const statusOf = useCallback((id) => {
    const p = store[id];
    if (!p) return 'new';
    if (p.due <= Date.now()) return 'due';
    return p.box >= SOLID_BOX ? 'solid' : 'learning';
  }, [store]);

  const noteOf = useCallback((id) => store[id]?.note || '', [store]);

  const clear = useCallback(() => {
    save({});
    setStore({});
  }, []);

  return { store, record, statusOf, noteOf, clear };
}
