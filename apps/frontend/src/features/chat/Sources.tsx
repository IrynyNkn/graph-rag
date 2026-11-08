import type { Citation } from '@graph-rag/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { ChevronIcon } from '../../app/icons';
import { SNAPPY } from '../../app/motion';

export function Sources({ citations }: { citations: Citation[] }) {
  const [isOpen, setIsOpen] = useState(false);
  if (citations.length === 0) {
    return null;
  }
  return (
    <div className="sources" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="sources-toggle"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        <ChevronIcon />
        Sources ({citations.length})
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            className="sources-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SNAPPY}
          >
            {citations.map((citation) => (
              <blockquote key={citation.chunkId}>
                <cite>{citation.documentName}</cite>
                {citation.text}
              </blockquote>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
