import { Check } from 'lucide-react';

// Decorative only: a floating "idea" card, a "got it" chip and a slow-turning recall ring.
export default function HeroArt() {
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="art-glow" />
      <div className="art-ring" />
      <div className="art-dots">
        {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
      </div>
      <div className="art-card art-card-a">
        <span className="art-tag">Why it works</span>
        <span className="art-bar w80" />
        <span className="art-bar w55" />
      </div>
      <div className="art-card art-card-b">
        <span className="art-check"><Check size={14} /></span>
        Got it
      </div>
      <div className="art-block" />
    </div>
  );
}
