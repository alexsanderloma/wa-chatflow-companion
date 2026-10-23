import { useId, useMemo } from "react";

export interface AreaPoint { label: string; a: number; b?: number }

export function MiniAreaChart({
  data, height = 180, labelA = "recebidas", labelB = "respondidas pela IA",
}: { data: AreaPoint[]; height?: number; labelA?: string; labelB?: string }) {
  const id = useId();
  const w = 560;
  const h = height;
  const pad = { t: 12, r: 10, b: 24, l: 30 };
  const inner = { w: w - pad.l - pad.r, h: h - pad.t - pad.b };

  const { ptsA, ptsB, areaA, max } = useMemo(() => {
    const n = Math.max(data.length, 2);
    const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b ?? 0)));
    const x = (i: number) => pad.l + (inner.w * i) / (n - 1);
    const y = (v: number) => pad.t + inner.h - (v / max) * inner.h;
    const ptsA = data.map((d, i) => `${x(i)},${y(d.a)}`).join(" ");
    const ptsB = data.some((d) => d.b !== undefined)
      ? data.map((d, i) => `${x(i)},${y(d.b ?? 0)}`).join(" ")
      : "";
    const areaA = `${pad.l},${pad.t + inner.h} ${ptsA} ${pad.l + inner.w},${pad.t + inner.h}`;
    return { ptsA, ptsB, areaA, max };
  }, [data, inner.h, inner.w, pad.l, pad.t]);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label={`${labelA} e ${labelB}`}>
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--chart-1)" stopOpacity=".9" />
            <stop offset="1" stopColor="var(--chart-1)" stopOpacity=".25" />
          </linearGradient>
        </defs>
        {[0, .25, .5, .75, 1].map((fraction) => (
          <g key={fraction}>
            <line x1={pad.l} x2={w - pad.r} y1={pad.t + inner.h * fraction} y2={pad.t + inner.h * fraction} stroke="var(--border)" strokeWidth=".6" />
            <text x={pad.l - 6} y={pad.t + inner.h * fraction + 3} textAnchor="end" fontSize="8" fill="var(--muted-foreground)">{Math.round(max * (1 - fraction))}</text>
          </g>
        ))}
        {data.map((point, i) => {
          const step = inner.w / Math.max(data.length, 1);
          const barHeight = (point.a / max) * inner.h;
          return <rect key={`${point.label}-${i}`} x={pad.l + step * i + step * .2} y={pad.t + inner.h - barHeight} width={step * .55} height={barHeight} rx="1" fill={`url(#g-${id})`}><title>{point.label}: {point.a} {labelA}</title></rect>;
        })}
        {data.length < 2 && <polyline points={ptsA} fill="none" stroke="var(--chart-1)" strokeWidth="2" />}
        {ptsB && (
          <polyline points={ptsB} fill="none" stroke="var(--chart-2)" strokeWidth="1.5" />
        )}
        {data.filter((_, i) => i % Math.max(1, Math.ceil(data.length / 7)) === 0).map((point) => (
          <text key={point.label} x={pad.l + (inner.w * data.indexOf(point)) / Math.max(1, data.length - 1)} y={h - 5} fontSize="8" textAnchor="middle" fill="var(--muted-foreground)">{point.label}</text>
        ))}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground mt-1 px-1">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-1" /> {labelA}</span>
        {ptsB && <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-2" /> {labelB}</span>}
        <span className="ml-auto opacity-60">pico {max}</span>
      </div>
    </div>
  );
}
