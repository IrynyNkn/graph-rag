/** For things the pointer moves directly: highlights, toggles, the hover card. */
export const SNAPPY = { type: 'spring', stiffness: 520, damping: 40, mass: 0.9 } as const;

/** For things that travel: nodes between graphs, the composer between its two places. */
export const SMOOTH = { type: 'spring', stiffness: 240, damping: 30, mass: 1 } as const;

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
