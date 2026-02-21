export function formatAxisTime(ms, rangeMs, viewMinMs, viewMaxMs) {
  const d = new Date(ms);

  const p2 = (n) => String(n).padStart(2, "0");
  const DD = p2(d.getDate());
  const hh = p2(d.getHours());
  const mm = p2(d.getMinutes());
  const ss = p2(d.getSeconds());

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MMM = months[d.getMonth()];
  const YYYY = String(d.getFullYear());

  const crossesYears = new Date(viewMinMs).getFullYear() !== new Date(viewMaxMs).getFullYear();

  if (rangeMs <= 2 * 60 * 60 * 1000) {
    return `${hh}:${mm}:${ss}`;
  }

  if (rangeMs <= 2 * 864e5) {
    return `${DD} ${MMM} ${hh}:${mm}`;
  }

  if (rangeMs <= 120 * 864e5) {
    return crossesYears ? `${DD} ${MMM} ${YYYY}` : `${DD} ${MMM}`;
  }

  if (rangeMs <= 3 * 365 * 864e5) {
    return `${MMM} ${YYYY}`;
  }

  return `${YYYY}`;
}
