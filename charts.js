/* =========================================================================
   CHART PALETTE
   Categorical palette validated with the dataviz skill's checker
   (lightness band, chroma floor, CVD separation, normal-vision floor,
   contrast) — slot 1 swapped to the app's brand blue, slots 2-8 are the
   documented default order. Colors are assigned by entity identity
   (see Store.addEnvelope's colorIndex), never by position, so a
   category keeps its color even as siblings are added or removed.
   The hex values live in styles.css (--chart-1 … --chart-8) so dark mode
   can swap in its own validated steps of the same hues.
   ========================================================================= */
const CHART_PALETTE = [
  'var(--chart-1)', // blue (brand)
  'var(--chart-2)', // orange
  'var(--chart-3)', // aqua
  'var(--chart-4)', // yellow
  'var(--chart-5)', // magenta
  'var(--chart-6)', // green
  'var(--chart-7)', // violet
  'var(--chart-8)', // red
];
const CHART_OTHER_COLOR = 'var(--chart-other)';

function paletteColor(index) {
  return Number.isInteger(index) && index >= 0 && index < CHART_PALETTE.length
    ? CHART_PALETTE[index]
    : CHART_OTHER_COLOR;
}

/* =========================================================================
   DONUT CHART
   Renders a donut + legend into `container`. `segments` is
   [{ label, value, color }]; non-positive values are dropped. Slices get
   rounded caps and a small gap instead of a border, per the surface-gap
   convention (touching marks separate with a gap in the surface color,
   not a stroke).
   ========================================================================= */
function renderDonut(container, segments, opts = {}) {
  const {
    emptyText = 'No data yet',
    size = 140,
    thickness = 20,
    formatValue = (v) => String(v),
  } = opts;

  const clean = segments.filter((s) => s.value > 0);
  const total = clean.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0) {
    container.innerHTML = `<div class="empty">${emptyText}</div>`;
    return;
  }

  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const GAP = clean.length > 1 ? 3 : 0;

  let cursor = 0;
  const arcs = clean.map((seg) => {
    const raw = (seg.value / total) * circumference;
    const drawn = Math.max(raw - GAP, raw * 0.6);
    const dashoffset = -(cursor + GAP / 2);
    cursor += raw;
    return `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${seg.color}"
      stroke-width="${thickness}" stroke-linecap="round"
      stroke-dasharray="${drawn} ${circumference - drawn}"
      stroke-dashoffset="${dashoffset}" />`;
  }).join('');

  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Donut chart">
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--surface-dim)" stroke-width="${thickness}" />
      <g transform="rotate(-90 ${c} ${c})">${arcs}</g>
    </svg>
  `;

  const legend = clean.map((seg) => `
    <div class="legend-row">
      <span class="legend-dot" style="background:${seg.color}"></span>
      <span class="legend-label">${seg.label}</span>
      <span class="legend-value">${formatValue(seg.value)}</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="donut-wrap">
      <div class="donut-figure" style="width:${size}px;height:${size}px;">
        ${svg}
        <div class="donut-center">
          <div class="donut-center-value">${formatValue(total)}</div>
          <div class="donut-center-label">total</div>
        </div>
      </div>
      <div class="legend">${legend}</div>
    </div>
  `;
}
