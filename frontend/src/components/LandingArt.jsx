import { Check, MessageCircle } from 'lucide-react';

// Decorative hero graphic: a teammate's change, a question about it, and the answer.
export default function LandingArt() {
  return (
    <div className="la" aria-hidden="true">
      <div className="la-ring" />
      <div className="la-panel" />
      <div className="la-square" />
      <div className="la-dots">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>

      <div className="la-card">
        <div className="la-card-head">
          <span className="la-avatar">S</span>
          <span className="la-tag">Sam &middot; Payments</span>
        </div>
        <span className="la-title">Added random pauses between payment retries</span>
        <span className="la-line w90" />
        <div className="la-opt"><MessageCircle size={13} /> Why the random pause?</div>
        <div className="la-opt ok"><span className="la-radio on"><Check size={10} /></span> Stops a pile-up</div>
      </div>

      <div className="la-stat">
        <small>New from your team</small>
        <strong>3 decisions</strong>
      </div>
      <div className="la-block" />
    </div>
  );
}
