const numberUNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod', 'Vg', 'Uvg', 'Dvg', 'Tvg', 'Qavg', 'Qivg', 'Sxvg', 'Spvg', 'Ocvg', 'Novg', 'Tg', 'Ce']

const timeUNITS = {
  qs: 1e-30,            // quectosecond
  rs: 1e-27,            // rontosecond
  ys: 1e-24,            // yoctosecond
  zs: 1e-21,            // zeptosecond
  as: 1e-18,            // attosecond
  fs: 1e-15,            // femtosecond
  ps: 1e-12,            // picosecond
  ns: 1e-9,             // nanosecond
  us: 1e-6,             // microsecond
  ms: 1e-3,             // millisecond
  s: 1,                 // second
  m: 60,                // minute
  h: 3600,              // hour
  d: 86400,             // day
  w: 604800,            // week
  mo: 2629746,          // month ~ 30.44 days
  y: 31557600,          // year ~ 365.25 days
  dec: 315576000,       // decade (10 years)
  c: 3155760000,        // century (100 years)
  ky: 3.15576e10,       // kilo-year (1K years)
  My: 3.15576e13,       // mega-year (1M years)
  Gy: 3.15576e16,       // giga-year (1B years)
  Ty: 3.15576e19,       // tera-year (1T years)
  Py: 3.15576e22,       // peta-year (1Qa years)
  Ey: 3.15576e25,       // exa-year (1Qi years)
  Zy: 3.15576e28,       // zetta-year (1Sx years)
  Yy: 3.15576e31,       // yotta-year (1Sp years)
  Ry: 3.15576e34,       // ronna-year (1Oc years)
  Qy: 3.15576e37        // quetta-year (1No years)
};

const order = Object.entries(timeUNITS).sort((a, b) => b[1] - a[1]);

export function formatNumber(value) {
  const variation = localStorage.getItem("variation")

  if (variation === "normal") {
    if (!isFinite(value)) return '—';
    const neg = value < 0;
    if (neg) value = -value;

    let i = 0;
    while (value >= 1000 && i < numberUNITS.length - 1) {
      value /= 1000;
      i++;
    }

    const s = value.toFixed(2).replace(/\.00$/, '');
    const result = (neg ? '-' : '') + s + numberUNITS[i];

    return result;
  };
  if (variation === "scientific") return value.toExponential();
  return value.toLocaleString();
}

export function formatDuration(sec, { maxUnits = 3, decimals = 2 } = {}) {
  sec = Math.max(0, Number(sec) || 0);

  const LARGE_UNIT_THRESHOLD = 1e6

  if (order.length > 0) {
    const [largestName, largestValue] = order[0];
    const amtLargest = sec / largestValue;
    if (amtLargest >= LARGE_UNIT_THRESHOLD) {
      const formatted = formatNumber(amtLargest);
      const result = formatted + ' ' + largestName;
      return result;
    }
  }

  const parts = [];
  let remaining = sec;

  for (let i = 0; i < order.length; i++) {
    const [name, value] = order[i];
    if (parts.length >= maxUnits) break;

    const slotsLeft = maxUnits - parts.length;
    if (slotsLeft === 1) {
      const amt = remaining / value;
      const rounded = Number(amt.toFixed(decimals));
      parts.push(rounded + name);
      remaining = 0;
    } else {
      const amt = Math.floor(remaining / value);
      if (amt > 0) {
        parts.push(amt + name);
        remaining -= amt * value;
      }
    }
  }

  let result = parts.join(' ');
  if (result === '') result = '0s';
  return result;
}
