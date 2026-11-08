import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { SNAPPY } from '../../app/motion';
import type { TurnAnalysis } from './turn-state';
import { isSameQuestion } from './turns';
import './AnalysisNote.css';

interface AnalysisNoteProps {
  question: string | null;
  analysis: TurnAnalysis | null;
  /** Grows into place when it arrives, instead of being there from the start. */
  isLive?: boolean;
}

/** How the question was understood, when that is not plain from the question itself. */
export function AnalysisNote({ question, analysis, isLive = false }: AnalysisNoteProps) {
  const note = question !== null && analysis !== null && describe(question, analysis);
  if (!note) {
    return null;
  }
  return (
    <motion.p
      className="analysis-note"
      initial={isLive ? { opacity: 0, height: 0 } : false}
      animate={{ opacity: 1, height: 'auto' }}
      transition={SNAPPY}
    >
      {note}
    </motion.p>
  );
}

function describe(question: string, analysis: TurnAnalysis): ReactNode {
  if (analysis.route === 'conversation') {
    return 'Answered from the conversation';
  }
  if (isSameQuestion(question, analysis.standaloneQuestion)) {
    return null;
  }
  return (
    <>
      Searched for <span>{analysis.standaloneQuestion}</span>
    </>
  );
}
