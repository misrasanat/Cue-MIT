import { Sparkles, RotateCw, Clock, CheckCircle2, ChevronRight } from 'lucide-react';
import { friendlyCategory, sourceLabel } from '../utils/cards';

const STATUS = {
  new: { label: 'New', Icon: Sparkles },
  due: { label: 'Time to review', Icon: RotateCw },
  learning: { label: 'Coming back soon', Icon: Clock },
  solid: { label: 'You’ve got this', Icon: CheckCircle2 },
};

export default function LessonRow({ lesson, status, onOpen, showSource = true }) {
  const { label, Icon } = STATUS[status];
  return (
    <button className={`lesson-row status-${status}`} onClick={onOpen}>
      <span className="lesson-row-icon" aria-hidden="true"><Icon size={18} /></span>
      <span className="lesson-row-main">
        <span className="lesson-row-title">{lesson.title}</span>
        <span className="lesson-row-meta">
          {showSource && <span>{sourceLabel(lesson.source)}</span>}
          <span>{friendlyCategory(lesson.category)}</span>
        </span>
      </span>
      <span className="lesson-row-status">{label}</span>
      <ChevronRight size={18} className="lesson-row-chev" aria-hidden="true" />
    </button>
  );
}
