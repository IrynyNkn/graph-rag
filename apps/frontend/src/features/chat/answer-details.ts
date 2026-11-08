import type { TurnModels, TurnTimings } from '@graph-rag/contracts';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

export interface DetailRow {
  label: string;
  value: string;
}

export function formatDuration(ms: number): string {
  if (ms < MS_PER_SECOND) {
    return `${Math.round(ms)} ms`;
  }
  const seconds = ms / MS_PER_SECOND;
  if (seconds < SECONDS_PER_MINUTE) {
    return `${seconds.toFixed(1)} s`;
  }
  const whole = Math.round(seconds);
  return `${Math.floor(whole / SECONDS_PER_MINUTE)} min ${whole % SECONDS_PER_MINUTE} s`;
}

export function totalMs({ analysisMs, searchMs, waitMs, writingMs }: TurnTimings): number {
  return analysisMs + (searchMs ?? 0) + waitMs + writingMs;
}

/** An answer from the conversation never searched, so it has no search time or embedding model. */
export function detailRows(timings: TurnTimings, models: TurnModels | undefined): DetailRow[] {
  const { analysisMs, searchMs, waitMs, writingMs } = timings;
  const hasSearched = searchMs !== null;
  const rows: (DetailRow | false | undefined)[] = [
    { label: 'Understanding the question', value: formatDuration(analysisMs) },
    hasSearched && { label: 'Searching the graph', value: formatDuration(searchMs) },
    { label: 'Waiting for the first word', value: formatDuration(waitMs) },
    { label: 'Writing the answer', value: formatDuration(writingMs) },
    models && { label: 'Chat model', value: models.chat },
    models && hasSearched && { label: 'Embedding model', value: models.embedding },
  ];
  return rows.filter((row) => row !== false && row !== undefined);
}
