import { ArrowRight, Sparkles, RotateCw, Users, Zap, Rocket, Check, CheckCircle2, FileCode } from 'lucide-react';
import Reveal from '../components/Reveal';
import Command from '../components/Command';
import LandingArt from '../components/LandingArt';

const MOMENTS = [
  {
    quote: '“I approved it. I think I understood it.”',
    text: 'Your assistant hands you a big change. It works. You couldn’t defend a single choice in it.',
  },
  {
    quote: '“Wait, who changed this, and why?”',
    text: 'A teammate’s AI reshapes something you depend on, and you find out when it breaks.',
  },
  {
    quote: '“Why on earth is it built like this?”',
    text: 'Months later nobody remembers the reasoning. Not even the person who wrote the prompt.',
  },
];

const STEPS = [
  {
    title: 'Install Cue',
    text: 'One package, straight from pip.',
    command: 'pip install cue-companion',
  },
  {
    title: 'Create your account',
    text: 'Run it to sign up or log in. Your account is how your team’s knowledge finds its way to you.',
    command: 'cue',
  },
  {
    title: 'Connect your assistant',
    text: 'Hooks Cue into Gemini CLI and Antigravity, so it can follow along while they work.',
    command: 'cue-setup',
  },
  {
    title: 'Build like normal',
    text: 'That’s it. Cue logs sessions quietly in the background. When you’re ready, open Cue and tap Make lessons.',
  },
];

const GAPS = ['10 min', '1 day', '3 days', '1 week', '3 weeks'];

export default function Landing({ signedIn, onOpenApp, onSignUp, onLogIn, onGuest }) {
  // Someone already inside the app (via the logo) gets a way back in instead of sign-up prompts.
  const ctaButtons = signedIn ? (
    <button className="btn btn-primary btn-lg" onClick={onOpenApp}>
      Open Cue <ArrowRight size={18} />
    </button>
  ) : (
    <>
      <button className="btn btn-primary btn-lg" onClick={onSignUp}>
        Get started <ArrowRight size={18} />
      </button>
      <button className="btn btn-soft btn-lg" onClick={onGuest}>Try the demo</button>
    </>
  );

  return (
    <div className="landing" id="top">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand brand-grow" href="#top" aria-label="Cue home">
            <span className="brand-mark" aria-hidden="true">C</span>
            <span className="brand-name">Cue</span>
          </a>
          <nav className="landing-links" aria-label="Sections">
            <a href="#why">Why Cue</a>
            <a href="#features">Features</a>
            <a href="#setup">Set up</a>
          </nav>
          <div className="topbar-end">
            {signedIn ? (
              <button className="btn btn-primary" onClick={onOpenApp}>Open Cue</button>
            ) : (
              <>
                <button className="btn btn-ghost" onClick={onLogIn}>Log in</button>
                <button className="btn btn-primary" onClick={onSignUp}>Sign up</button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="l-wrap l-hero">
          <div className="l-hero-copy">
            <span className="eyebrow eyebrow-live">Built for teams that code with AI</span>
            <h1>
              Your team&rsquo;s AI moves fast. Stay <span className="hl gradient-text">ahead</span> of it.
            </h1>
            <p className="lede">
              Cue turns every AI coding session, yours and your teammates&rsquo;, into the story behind the code:
              what changed, why, and what else was on the table. Ask anything. Never nod along in a review again.
            </p>
            <div className="l-cta-row">
              {ctaButtons}
            </div>
            <div className="l-compat">
              <span>Works with</span>
              <span className="l-pill">Gemini CLI</span>
              <span className="l-pill">Antigravity</span>
            </div>
          </div>
          <LandingArt />
        </section>

        {/* The problem, told as moments people recognise */}
        <section className="l-wrap l-section" id="why">
          <Reveal className="l-head">
            <span className="eyebrow">Sound familiar?</span>
            <h2>AI made shipping faster. It also made falling behind easier.</h2>
            <p className="lede">Code appears in minutes. The reasons behind it vanish just as fast.</p>
          </Reveal>
          <div className="l-moments">
            {MOMENTS.map((m, i) => (
              <Reveal key={m.quote} delay={i * 0.1} className="l-card l-moment">
                <h3 className="l-quote">{m.quote}</h3>
                <p>{m.text}</p>
              </Reveal>
            ))}
          </div>
          <Reveal as="p" className="l-punch">
            Cue keeps the reasoning, <span className="gradient-text">for everyone</span>, with nothing extra to write.
          </Reveal>
        </section>

        {/* Features */}
        <section className="l-wrap l-section" id="features">
          <Reveal className="l-head">
            <span className="eyebrow">What Cue does</span>
            <h2>Meet your team&rsquo;s memory.</h2>
            <p className="lede">It listens while your AI works, writes up every real decision, and makes all of it effortless to explore.</p>
          </Reveal>
          <div className="l-bento">
            <Reveal className="l-card wide">
              <span className="l-icon"><Sparkles size={22} /></span>
              <h3>Every AI session, explained</h3>
              <p>Cue watches what your assistant changes and writes up the thinking behind each meaningful change. No notes to take, no docs to maintain, no meeting to schedule.</p>
              <div className="l-flow">
                {['What changed', 'Why', 'What else was possible', 'The trade-offs'].map((label, i, all) => (
                  <span key={label} className="l-flow-item">
                    <span className="l-pill">{label}</span>
                    {i < all.length - 1 && <ArrowRight size={14} aria-hidden="true" />}
                  </span>
                ))}
              </div>
            </Reveal>

            <Reveal className="l-card" delay={0.1}>
              <span className="l-icon"><Users size={22} /></span>
              <h3>Ask your team&rsquo;s brain</h3>
              <p>Wonder why a teammate built it that way? Ask in plain English and get an answer from their own work.</p>
              <div className="l-gaps"><span className="l-pill">&ldquo;Why the retry delay?&rdquo;</span></div>
            </Reveal>

            <Reveal className="l-card">
              <span className="l-icon"><Zap size={22} /></span>
              <h3>Catch up in minutes</h3>
              <p>See what every teammate shipped, one decision at a time. A Monday-morning catch-up, not a week of pull-request archaeology.</p>
              <div className="l-gaps">
                <span className="l-pill">Sam &middot; payments</span>
                <span className="l-pill">Priya &middot; auth</span>
              </div>
            </Reveal>

            <Reveal className="l-card" delay={0.1}>
              <span className="l-icon"><RotateCw size={22} /></span>
              <h3>Decisions that stick</h3>
              <p>A quick check and a chance to say it in your own words. Cue brings each idea back just before you&rsquo;d forget it.</p>
              <div className="l-gaps">
                {GAPS.slice(0, 4).map((gap) => <span key={gap} className="l-pill mono">{gap}</span>)}
              </div>
            </Reveal>

            <Reveal className="l-card" delay={0.2}>
              <span className="l-icon"><Rocket size={22} /></span>
              <h3>New teammate? Up to speed in days</h3>
              <p>The whole history of why things are built the way they are, in plain English, ready on day one.</p>
            </Reveal>
          </div>
        </section>

        {/* Team Brain demo */}
        <section className="l-wrap l-section" id="ask">
          <div className="l-split">
            <Reveal className="l-split-copy">
              <span className="eyebrow">Team Brain</span>
              <h2>Ask your team anything. Get the real answer.</h2>
              <p className="lede">No more pinging someone, waiting, and getting a half-remembered reply. Cue answers from your teammate&rsquo;s actual work, and shows you exactly where it came from.</p>
              <ul className="l-list">
                <li><CheckCircle2 size={18} aria-hidden="true" /> Grounded in what was really built</li>
                <li><CheckCircle2 size={18} aria-hidden="true" /> Every answer cites its source</li>
                <li><CheckCircle2 size={18} aria-hidden="true" /> Turn any answer into a three-minute lesson</li>
              </ul>
            </Reveal>

            <Reveal className="l-mock l-chat" delay={0.1}>
              <div className="l-chat-q">Why do we pause between payment retries?</div>
              <div className="l-chat-a">
                <p>Sam added random pauses so a payment outage doesn&rsquo;t snowball. If every failed payment retried at the same moment, the flood would knock the provider back down each time it recovered.</p>
                <div className="callout callout-warm">
                  <strong>In simple terms</strong>
                  <span>Like cars merging onto a highway one at a time, instead of all at once.</span>
                </div>
                <span className="l-source"><FileCode size={14} aria-hidden="true" /> From Sam&rsquo;s note on <code>payment_retry.py</code></span>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Retention */}
        <section className="l-wrap l-section" id="lesson">
          <div className="l-split l-split-rev">
            <Reveal className="l-mock" delay={0.1}>
              <span className="eyebrow">Quick check</span>
              <h3 className="l-mock-q">Why add a random pause between payment retries?</h3>
              <div className="l-mock-choices">
                <div className="choice"><span className="choice-mark">A</span> So the server has time to sleep</div>
                <div className="choice correct"><span className="choice-mark"><Check size={16} /></span> So everyone doesn&rsquo;t retry at the same instant</div>
                <div className="choice"><span className="choice-mark">C</span> Because the payment provider asks for it</div>
              </div>
              <div className="feedback feedback-good"><strong>Yes, that&rsquo;s it.</strong><span>Spreading retries out stops a pile-up.</span></div>
            </Reveal>

            <Reveal className="l-split-copy">
              <span className="eyebrow">Make it stick</span>
              <h2>Understand it now. Still know it next month.</h2>
              <p className="lede">Each decision comes with a friendly question and a chance to explain it your way. Cue brings it back right before you&rsquo;d forget, so you can defend any choice in any review.</p>
              <ul className="l-list">
                <li><CheckCircle2 size={18} aria-hidden="true" /> Real questions about real decisions</li>
                <li><CheckCircle2 size={18} aria-hidden="true" /> Trade-offs explained, not just answers</li>
                <li><CheckCircle2 size={18} aria-hidden="true" /> A line you can say out loud in standup</li>
              </ul>
            </Reveal>
          </div>
        </section>

        {/* Setup */}
        <section className="l-wrap l-section" id="setup">
          <Reveal className="l-head">
            <span className="eyebrow">Set up</span>
            <h2>Three commands. Then Cue works in the background.</h2>
            <p className="lede">Do it once per machine. After that there is nothing to remember.</p>
            <div className="l-compat l-compat-flush">
              <span>Supports</span>
              <span className="l-pill">Gemini CLI</span>
              <span className="l-pill">Antigravity</span>
              <span>for now</span>
            </div>
          </Reveal>
          <div className="l-steps">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.1} className="l-step">
                <span className="l-step-num gradient-text">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                {step.command && <Command text={step.command} />}
                {i < STEPS.length - 1 && <span className="l-connect" aria-hidden="true"><ArrowRight size={14} /></span>}
              </Reveal>
            ))}
          </div>
        </section>

        {/* Stats band */}
        <Reveal as="section" className="l-wrap l-band-wrap">
          <div className="l-band">
            <div><strong className="gradient-text">0</strong><span>docs to write</span></div>
            <div><strong className="gradient-text">3</strong><span>commands, once</span></div>
            <div><strong className="gradient-text">~3 min</strong><span>per decision</span></div>
          </div>
        </Reveal>

        {/* Final call to action */}
        <Reveal as="section" className="l-wrap l-final-wrap">
          <div className="l-final">
            <h2>Be the one who always knows <span className="gradient-text">why</span>.</h2>
            <p className="lede">Setup takes a couple of minutes, and your very next AI session becomes something your whole team can learn from.</p>
            <div className="l-cta-row l-cta-center">
              {ctaButtons}
            </div>
          </div>
        </Reveal>
      </main>

      <footer className="l-wrap l-footer">
        <span className="brand-mark small-mark" aria-hidden="true">C</span>
        <span>Cue. Every decision your team makes with AI, explained.</span>
      </footer>
    </div>
  );
}
