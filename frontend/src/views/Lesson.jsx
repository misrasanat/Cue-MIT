import { useMemo, useState } from 'react';
import {
  X, ArrowRight, Check, Copy, CheckCircle2, XCircle, Lightbulb, RotateCcw, Sprout, FileCode, PartyPopper,
} from 'lucide-react';
import { baseName, firstSentence, friendlyCategory, shuffledOrder } from '../utils/cards';
import { RATING, describeGap } from '../utils/progress';

// A lesson is a short guided walk through one idea. New ideas get the full walk;
// ideas you've seen before get a quick review (check yourself, then explain it back).
function stepsFor(lesson, mode) {
  if (mode === 'review') {
    return [lesson.quiz && 'check', 'recall', 'done'].filter(Boolean);
  }
  return [
    'idea',
    'why',
    lesson.alternatives.length > 0 && 'options',
    lesson.quiz && 'check',
    'recall',
    'done',
  ].filter(Boolean);
}

export default function Lesson({ queue, mode: startMode, progress, onExit }) {
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState(startMode);
  const [results, setResults] = useState([]);

  const lesson = queue[index];

  if (!lesson) {
    const solid = results.filter((r) => r.rating === RATING.GOT_IT).length;
    return (
      <div className="lesson-shell">
        <div className="lesson-card lesson-summary">
          <PartyPopper size={40} className="summary-icon" aria-hidden="true" />
          <h1>{results.length === 1 ? 'One idea down.' : `${results.length} ideas down.`}</h1>
          <p className="lede">
            {solid === results.length
              ? 'You explained every one of them well. That’s exactly how it sticks.'
              : 'The ones that felt shaky will come back sooner, so you get another go before they fade.'}
          </p>
          <button className="btn btn-primary btn-lg" onClick={onExit}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <LessonRun
      key={`${lesson.id}-${mode}`}
      lesson={lesson}
      mode={mode}
      position={{ index, total: queue.length }}
      progress={progress}
      onExit={onExit}
      onFullLesson={() => setMode('learn')}
      onFinished={(rating) => {
        // A single lesson already ended on its own celebration screen, so skip the summary.
        if (queue.length === 1) {
          onExit();
          return;
        }
        setResults((r) => [...r, { id: lesson.id, rating }]);
        setMode(startMode);
        setIndex((i) => i + 1);
      }}
    />
  );
}

function LessonRun({ lesson, mode, position, progress, onExit, onFullLesson, onFinished }) {
  const steps = stepsFor(lesson, mode);
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const next = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1));

  const [picked, setPicked] = useState(null);
  const [note, setNote] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [rating, setRating] = useState(null);
  const [comeBack, setComeBack] = useState('');
  const [copied, setCopied] = useState(false);

  const options = useMemo(() => {
    if (!lesson.quiz) return [];
    return shuffledOrder(lesson.quiz.options.length).map((i) => ({
      text: lesson.quiz.options[i],
      correct: i === lesson.quiz.correct_index,
    }));
  }, [lesson]);
  const quizRight = picked !== null && options[picked]?.correct;
  const keyIdea = lesson.tip || firstSentence(lesson.why) || lesson.decision;
  const previousNote = progress.noteOf(lesson.id);

  const rate = (value) => {
    setRating(value);
    const box = progress.record(lesson.id, { quizRight: !!quizRight, rating: value, note: note.trim() });
    setComeBack(describeGap(box));
    next();
  };

  // The plain-English title is the thing you'd actually say out loud; the rest is detail.
  const standupLine = lesson.title.trim();
  const copyStandup = async () => {
    try {
      await navigator.clipboard.writeText(standupLine);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the line is still visible to read out.
    }
  };

  const isLast = position.index === position.total - 1;

  return (
    <div className="lesson-shell">
      <div className="lesson-top">
        <button className="icon-btn" onClick={onExit} aria-label="Save and leave this lesson">
          <X size={20} />
        </button>
        <div className="lesson-progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length - 1} aria-valuenow={stepIndex}>
          <div className="lesson-progress-fill" style={{ width: `${(stepIndex / (steps.length - 1)) * 100}%` }} />
        </div>
        {position.total > 1 && <span className="lesson-count">{position.index + 1} of {position.total}</span>}
      </div>

      <div className={`lesson-card step-${step}`} key={step}>
        {step === 'idea' && (
          <>
            <span className="eyebrow">{friendlyCategory(lesson.category)}</span>
            <h1>{lesson.title}</h1>
            {lesson.decision && lesson.decision !== lesson.title && (
              <p className="tech-line"><span>In technical terms</span>{lesson.decision}</p>
            )}
            {lesson.analogy && (
              <aside className="callout callout-warm">
                <strong>Think of it like this</strong>
                <span>{lesson.analogy}</span>
              </aside>
            )}
            {lesson.file && (
              <p className="where"><FileCode size={14} aria-hidden="true" /> Found in <code>{baseName(lesson.file)}</code></p>
            )}
            <button className="btn btn-primary btn-lg" onClick={next}>Got it, keep going <ArrowRight size={18} /></button>
          </>
        )}

        {step === 'why' && (
          <>
            <span className="eyebrow">Why it was done this way</span>
            <p className="body-large">{lesson.why}</p>
            {lesson.tip && (
              <aside className="callout callout-cool">
                <strong><Lightbulb size={15} aria-hidden="true" /> Worth remembering</strong>
                <span>{lesson.tip}</span>
              </aside>
            )}
            <button className="btn btn-primary btn-lg" onClick={next}>Continue <ArrowRight size={18} /></button>
          </>
        )}

        {step === 'options' && (
          <Options lesson={lesson} onNext={next} />
        )}

        {step === 'check' && (
          <>
            <span className="eyebrow">Quick check</span>
            <h1 className="question">{lesson.quiz.question}</h1>
            <div className="choices" role="group" aria-label="Answers">
              {options.map((opt, i) => {
                let state = '';
                if (picked !== null) {
                  if (opt.correct) state = 'correct';
                  else if (i === picked) state = 'wrong';
                }
                return (
                  <button
                    key={i}
                    className={`choice ${state}`}
                    disabled={picked !== null}
                    onClick={() => setPicked(i)}
                  >
                    <span className="choice-mark" aria-hidden="true">
                      {state === 'correct' ? <Check size={16} /> : state === 'wrong' ? <X size={16} /> : String.fromCharCode(65 + i)}
                    </span>
                    {opt.text}
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <div className={`feedback ${quizRight ? 'feedback-good' : 'feedback-soft'}`} role="status">
                <strong>{quizRight ? 'Yes, that’s it.' : 'Not quite, and that’s fine.'}</strong>
                {!quizRight && <span>The right answer is highlighted in green.</span>}
              </div>
            )}
            {picked !== null && (
              <button className="btn btn-primary btn-lg" onClick={next}>Continue <ArrowRight size={18} /></button>
            )}
            {mode === 'review' && picked === null && (
              <button className="link-btn" onClick={onFullLesson}>Need a refresher? Walk me through it again</button>
            )}
          </>
        )}

        {step === 'recall' && (
          <>
            <span className="eyebrow">In your own words</span>
            <h1 className="question">If a teammate asked, how would you explain this and why it matters?</h1>
            {previousNote && !revealed && (
              <p className="prev-note"><strong>Last time you wrote:</strong> {previousNote}</p>
            )}
            <textarea
              className="textarea"
              rows={4}
              placeholder="A sentence or two is plenty. Rough is fine."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={revealed}
            />
            {!revealed ? (
              <button className="btn btn-primary btn-lg" onClick={() => setRevealed(true)}>
                {note.trim() ? 'Compare with the key idea' : 'Show me the key idea'}
              </button>
            ) : (
              <>
                <aside className="callout callout-cool">
                  <strong><Lightbulb size={15} aria-hidden="true" /> The key idea</strong>
                  <span>{keyIdea}</span>
                </aside>
                <p className="ask">How close was your explanation?</p>
                <div className="rating">
                  <button className="rate rate-no" onClick={() => rate(RATING.NOT_YET)}>
                    <RotateCcw size={18} aria-hidden="true" /> Not yet
                  </button>
                  <button className="rate rate-mid" onClick={() => rate(RATING.ALMOST)}>
                    <Sprout size={18} aria-hidden="true" /> Almost
                  </button>
                  <button className="rate rate-yes" onClick={() => rate(RATING.GOT_IT)}>
                    <CheckCircle2 size={18} aria-hidden="true" /> Got it
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === 'done' && (
          <>
            <h1>
              {rating === RATING.GOT_IT && 'Nice, that one’s sticking.'}
              {rating === RATING.ALMOST && 'Getting there.'}
              {rating === RATING.NOT_YET && 'No worries, we’ll revisit it soon.'}
            </h1>
            <p className="lede">We’ll bring this idea back {comeBack}. Seeing it again just before you’d forget is what makes it stay.</p>
            <div className="callout callout-plain">
              <strong>If someone asks in standup, you could say</strong>
              <span>“{standupLine}”</span>
              <button className="link-btn" onClick={copyStandup}>
                {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy this</>}
              </button>
            </div>
            <button className="btn btn-primary btn-lg" onClick={() => onFinished(rating)}>
              {isLast ? 'Finish' : 'Next idea'} <ArrowRight size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Options({ lesson, onNext }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <span className="eyebrow">Other ways to do it</span>
      <h1 className="question">What else could they have done?</h1>
      <p className="lede">Every choice has trade-offs. Tap an option to see what you’d gain and lose.</p>
      <div className="alts">
        {lesson.alternatives.map((alt, i) => (
          <div key={i} className={`alt ${open === i ? 'open' : ''}`}>
            <button className="alt-head" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              {alt.option}
            </button>
            {open === i && (
              <div className="alt-body">
                {alt.pros?.length > 0 && (
                  <div>
                    <span className="alt-label">What you’d gain</span>
                    <ul>{alt.pros.map((p, k) => <li key={k}><CheckCircle2 size={15} className="good" aria-hidden="true" /> {p}</li>)}</ul>
                  </div>
                )}
                {alt.cons?.length > 0 && (
                  <div>
                    <span className="alt-label">What you’d give up</span>
                    <ul>{alt.cons.map((c, k) => <li key={k}><XCircle size={15} className="bad" aria-hidden="true" /> {c}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-lg" onClick={onNext}>Continue <ArrowRight size={18} /></button>
    </>
  );
}
