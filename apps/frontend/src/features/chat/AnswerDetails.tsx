import type { TurnModels, TurnTimings } from '@graph-rag/contracts';
import { detailRows } from './answer-details';
import './AnswerDetails.css';

interface AnswerDetailsProps {
  timings: TurnTimings;
  models: TurnModels | undefined;
}

export function AnswerDetails({ timings, models }: AnswerDetailsProps) {
  return (
    <dl className="answer-details">
      {detailRows(timings, models).map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
