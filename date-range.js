function recentThreeMonths(first, last) {
  if (!last) return "";
  const [year, month, day] = last.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 4, 1));
  const endOfTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, endOfTarget) + 1);
  const start = target.toISOString().slice(0, 10);
  return first && first > start ? first : start;
}
if (typeof module !== "undefined") module.exports = recentThreeMonths;
