import type { Citation, MessageMetadata } from '@graph-rag/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState, type ReactNode } from 'react';
import { ChevronIcon } from '../../app/icons';
import { SNAPPY } from '../../app/motion';
import { AnswerDetails } from './AnswerDetails';
import { formatDuration, totalMs } from './answer-details';
import { SourceList } from './SourceList';
import './AnswerFooter.css';

type PanelName = 'sources' | 'details';

const OPENED = { height: 'auto', opacity: 1 };
const CLOSED = { height: 0, opacity: 0 };

interface AnswerFooterProps {
  citations: Citation[];
  /** How the answer was made, which is known once it has been saved. */
  details?: Pick<MessageMetadata, 'timings' | 'models'> | null;
  /** Buttons for the answer, on the same row as the toggles. */
  tools?: ReactNode;
  onSourceHover: (chunkId: string | null) => void;
}

export function AnswerFooter({ citations, details, tools, onSourceHover }: AnswerFooterProps) {
  const [open, setOpen] = useState<PanelName | null>(null);
  const timings = details?.timings;
  if (citations.length === 0 && timings === undefined && !tools) {
    return null;
  }
  const toggle = (panel: PanelName) => setOpen(open === panel ? null : panel);
  return (
    <div className="answer-footer" onClick={(event) => event.stopPropagation()}>
      <div className="answer-footer-row">
        {citations.length > 0 && (
          <PanelToggle isOpen={open === 'sources'} onToggle={() => toggle('sources')}>
            Sources ({citations.length})
          </PanelToggle>
        )}
        {timings !== undefined && (
          <PanelToggle isOpen={open === 'details'} onToggle={() => toggle('details')}>
            Took {formatDuration(totalMs(timings))}
          </PanelToggle>
        )}
        {tools}
      </div>
      <AnimatePresence initial={false}>
        {open !== null && (
          <Panel key={open}>
            {open === 'sources' && <SourceList citations={citations} onHover={onSourceHover} />}
            {open === 'details' && timings !== undefined && (
              <AnswerDetails timings={timings} models={details?.models} />
            )}
          </Panel>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The last answer sits at the bottom of the timeline, where a panel would open out of sight. */
function Panel({ children }: { children: ReactNode }) {
  const element = useRef<HTMLDivElement>(null);
  return (
    <motion.div
      ref={element}
      className="answer-footer-panel"
      initial={CLOSED}
      animate={OPENED}
      exit={CLOSED}
      transition={SNAPPY}
      onAnimationComplete={(target) => {
        if (target === OPENED) {
          element.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }}
    >
      {children}
    </motion.div>
  );
}

interface PanelToggleProps {
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function PanelToggle({ isOpen, onToggle, children }: PanelToggleProps) {
  return (
    <button type="button" className="panel-toggle" aria-expanded={isOpen} onClick={onToggle}>
      <ChevronIcon />
      {children}
    </button>
  );
}
