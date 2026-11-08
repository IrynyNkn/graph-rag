import type { Citation } from '@graph-rag/contracts';
import './SourceList.css';

export function SourceList({ citations }: { citations: Citation[] }) {
  return citations.map((citation) => (
    <blockquote key={citation.chunkId} className="source">
      <cite>{citation.documentName}</cite>
      {citation.text}
    </blockquote>
  ));
}
