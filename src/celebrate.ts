import confetti from "canvas-confetti";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const PALETTE = ["#FFD700", "#FFE66D", "#5B9FFF", "#A855F7", "#2DD4BF"];

/** Celebratory confetti burst. No-op when the user prefers reduced motion. */
export function celebrate(): void {
  if (typeof window === "undefined" || prefersReducedMotion()) return;
  const defaults = { startVelocity: 38, spread: 360, ticks: 70, zIndex: 3000, colors: PALETTE };
  const fire = (ratio: number, opts: confetti.Options) =>
    confetti({ ...defaults, ...opts, particleCount: Math.floor(180 * ratio) });

  fire(0.25, { origin: { y: 0.7 }, spread: 60 });
  fire(0.2, { origin: { y: 0.7 }, spread: 100, decay: 0.92, scalar: 1.1 });
  fire(0.3, { origin: { y: 0.7 }, spread: 120, startVelocity: 25, decay: 0.92 });
  fire(0.1, { origin: { y: 0.7 }, spread: 120, startVelocity: 45 });
}
