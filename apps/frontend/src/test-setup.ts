import { MotionGlobalConfig } from 'motion/react';
import { vi } from 'vitest';

// The test DOM has no frames to run animations on, so what leaves the page would never leave.
MotionGlobalConfig.skipAnimations = true;

// It lays nothing out either, so it does not implement scrolling to an element.
Element.prototype.scrollIntoView = vi.fn<() => void>();
