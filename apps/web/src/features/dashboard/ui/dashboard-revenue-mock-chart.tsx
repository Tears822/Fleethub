import type { MockRevenuePoint } from "../mock/dashboard-mock";

function formatCompactEuro(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function DashboardRevenueMockChart({
  title,
  subtitle,
  rangeLabel,
  series,
}: {
  title: string;
  subtitle: string;
  /** e.g. 15/04 – 28/04 — overrides computed range from series when set */
  rangeLabel?: string;
  series: MockRevenuePoint[];
}) {
  const w = 720;
  const h = 220;
  const padL = 48;
  const padR = 16;
  const padT = 28;
  const padB = 36;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const maxY = Math.max(...series.map((p) => p.euro), 1);
  const minY = Math.min(...series.map((p) => p.euro), 0);
  const spanY = maxY - minY || 1;

  const points = series.map((p, i) => {
    const x = padL + (innerW * (series.length === 1 ? 0.5 : i / (series.length - 1)));
    const y = padT + innerH - ((p.euro - minY) / spanY) * innerH;
    return { x, y, label: p.day, euro: p.euro };
  });

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaD = `${d} L ${points[points.length - 1]?.x ?? padL} ${padT + innerH} L ${points[0]?.x ?? padL} ${padT + innerH} Z`;

  const yTicks = 4;
  const gridLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const y = padT + (innerH * i) / yTicks;
    const val = maxY - (spanY * i) / yTicks;
    return { y, val };
  });

  const rangeLabelDisplay =
    rangeLabel?.trim() ||
    (series.length >= 2
      ? `${series[0]?.day ?? ""} – ${series[series.length - 1]?.day ?? ""}`
      : "");

  return (
    <div className="erp-kpi-card">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
        </div>
        {rangeLabelDisplay ? (
          <span className="text-xs font-medium text-zinc-500">{rangeLabelDisplay}</span>
        ) : null}
      </div>
      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="min-w-[min(100%,720px)] w-full text-zinc-500"
          role="img"
          aria-label={title}
        >
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(34,197,94)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="rgb(34,197,94)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridLines.map((g, i) => (
            <g key={i}>
              <line
                x1={padL}
                x2={w - padR}
                y1={g.y}
                y2={g.y}
                stroke="#e4e4e7"
                strokeWidth={1}
              />
              <text x={4} y={g.y + 4} fill="currentColor" fontSize={10}>
                {formatCompactEuro(Math.round(g.val))}
              </text>
            </g>
          ))}
          <path d={areaD} fill="url(#revFill)" />
          <path
            d={d}
            fill="none"
            stroke="rgb(34,197,94)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="rgb(34,197,94)" stroke="white" strokeWidth={1} />
          ))}
          {points.map((p, i) => (
            <text
              key={`l-${i}`}
              x={p.x}
              y={h - 8}
              fill="currentColor"
              fontSize={9}
              textAnchor="middle"
            >
              {p.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
