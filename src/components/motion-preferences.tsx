"use client";

import * as React from "react";
import { MotionConfig, useReducedMotion } from "framer-motion";

/**
 * Honour the OS reduced-motion preference for JS-driven (framer-motion)
 * animations. The global CSS override in globals.css only collapses CSS
 * animations/transitions; motion components animate from JS and would
 * otherwise keep fading in. With `skipAnimations` every value is set
 * instantly — the same "instant cut" contract the stylesheet defines.
 */
export function MotionPreferences({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <MotionConfig reducedMotion="user" skipAnimations={reduce === true}>
      {children}
    </MotionConfig>
  );
}
