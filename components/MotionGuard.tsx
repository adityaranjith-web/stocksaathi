"use client";
import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

// Fail-safe for the entrance animation (the "rise" class). Each time a screen opens it lets the animation run for about
// 1.6 seconds, then marks the page as done (html[data-motion="done"]), after which every panel is shown as it is, whether or
// not the animation ran. Without it, a page whose animations do not run (a tab that is not being drawn, a slow phone) would
// keep panels invisible. See app/globals.css.
export const MOTION_DONE_AFTER_MS = 1600;

export default function MotionGuard() {
  const path = usePathname();
  useLayoutEffect(() => { // before the new screen is drawn, so its entrance animation is not skipped
    const root = document.documentElement;
    root.dataset.motion = "running";
    const timer = setTimeout(() => { root.dataset.motion = "done"; }, MOTION_DONE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [path]);
  return null;
}
