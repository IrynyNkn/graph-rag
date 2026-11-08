import type { Citation } from '@graph-rag/contracts';
import { useEffect } from 'react';
import './SourceList.css';

interface SourceListProps {
  citations: Citation[];
  /** Says which source the pointer is on, so that the graph can light what came from it. */
  onHover: (chunkId: string | null) => void;
}

export function SourceList({ citations, onHover }: SourceListProps) {
  // A list that closes under the pointer never gets its mouse leave.
  useEffect(() => () => onHover(null), [onHover]);
  return citations.map((citation) => (
    <blockquote
      key={citation.chunkId}
      className="source"
      onMouseEnter={() => onHover(citation.chunkId)}
      onMouseLeave={() => onHover(null)}
    >
      <cite>{citation.documentName}</cite>
      {citation.text}
    </blockquote>
  ));
}
