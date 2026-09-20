export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001';

// Capturing and lesson-making happen on each developer's own computer, so those calls go to the local helper
// even when the website itself is hosted.
export const LOCAL_API_BASE = import.meta.env.VITE_LOCAL_API_BASE || 'http://localhost:5001';
