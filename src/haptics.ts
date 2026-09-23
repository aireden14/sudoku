// В Сафари на айфоне вибрации нет, на Android сработает — остальным тихий no-op.
export function triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "warning" | "error" = "light") {
  if (!("vibrate" in navigator)) return;
  const pattern =
    type === "success" ? [12, 24, 28] : type === "warning" || type === "error" ? [30, 20, 30] : type === "heavy" ? 50 : type === "medium" ? 30 : 12;
  try {
    navigator.vibrate(pattern);
  } catch {}
}
