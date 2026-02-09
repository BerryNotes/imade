export function formatTime(s) {
  if (!s || isNaN(s)) return "0:00";
  return Math.floor(s / 60) + ":" + Math.floor(s % 60).toString().padStart(2, "0");
}

export function formatDuration(s) {
  if (s < 60) return Math.round(s) + "s";
  if (s < 3600) return Math.floor(s / 60) + "m " + Math.round(s % 60) + "s";
  return Math.floor(s / 3600) + "h " + Math.floor((s % 3600) / 60) + "m";
}
