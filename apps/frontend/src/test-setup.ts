import { MotionGlobalConfig } from 'motion/react';

// The test DOM has no frames to run animations on, so what leaves the page would never leave.
MotionGlobalConfig.skipAnimations = true;
