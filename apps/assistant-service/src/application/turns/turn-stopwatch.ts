import type { TurnEvent, TurnTimings } from '@graph-rag/contracts';

/** Times a turn from the events it emits, so that no strategy has to know about it. */
export class TurnStopwatch {
  private readonly startedAt = Date.now();
  private readonly firstAt = new Map<TurnEvent['type'], number>();
  private lastAt = this.startedAt;

  observe(type: TurnEvent['type']): void {
    this.lastAt = Date.now();
    if (!this.firstAt.has(type)) {
      this.firstAt.set(type, this.lastAt);
    }
  }

  read(): TurnTimings {
    const analysedAt = this.firstAt.get('analysis') ?? this.startedAt;
    const searchedAt = this.firstAt.get('graph');
    const firstWordAt = this.firstAt.get('token') ?? this.lastAt;
    return {
      analysisMs: analysedAt - this.startedAt,
      searchMs: searchedAt === undefined ? null : searchedAt - analysedAt,
      waitMs: firstWordAt - (searchedAt ?? analysedAt),
      writingMs: this.lastAt - firstWordAt,
    };
  }
}
