"use client";
import { useEffect, useState } from "react";
import DotIcon from "./DotIcon";

const KEY = "stocksaathi.panels"; // "solid" or "glass": the owner's own choice
type Nav = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

function apply(solid: boolean) {
  if (solid) document.documentElement.dataset.glass = "solid";
  else delete document.documentElement.dataset.glass;
}
function readChoice(): "solid" | "glass" | null {
  try { const v = localStorage.getItem(KEY); return v === "solid" || v === "glass" ? v : null; } catch { return null; }
}

// Chooses glass or solid panels.
// 1. The phone's "reduce transparency" setting is handled in CSS.
// 2. The owner's own choice (the button below) always wins.
// 3. Otherwise the app goes solid on weak phones: low memory, few cores, data saver, or a slow first second.
export default function GlassMode() {
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const choice = readChoice();
    if (choice) { setSolid(choice === "solid"); apply(choice === "solid"); return; }
    const nav = navigator as Nav;
    const weak = (nav.deviceMemory ?? 8) <= 2 || (nav.hardwareConcurrency ?? 8) <= 4 || nav.connection?.saveData === true;
    if (weak) { setSolid(true); apply(true); return; }
    // Frame check: if the first second runs under about 30 frames a second, switch to solid panels.
    let raf = 0; let frames = 0; let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      frames++;
      if (t - start < 1000) raf = requestAnimationFrame(tick);
      else if (frames < 30) { setSolid(true); apply(true); }
    };
    const timer = setTimeout(() => { raf = requestAnimationFrame(tick); }, 800);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, []);

  function toggle() {
    const next = !solid;
    setSolid(next); apply(next);
    try { localStorage.setItem(KEY, next ? "solid" : "glass"); } catch { /* storage blocked */ }
  }

  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-pressed={solid} aria-label="Solid panels" title={solid ? "Solid panels are on" : "Glass panels are on"}>
      <DotIcon name="layers" size={22} />
    </button>
  );
}
