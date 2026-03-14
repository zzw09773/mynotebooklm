"use client";

import { InfographicContent } from "@/lib/api";

interface Props {
    data: InfographicContent;
}

const COLORS = [
    "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
    "#ef4444", "#06b6d4", "#f97316", "#84cc16",
];

// ── Bar chart ─────────────────────────────────────────────────

function BarChart({ data }: { data: InfographicContent }) {
    const W = 400;
    const H = 220;
    const PADDING = { top: 20, right: 20, bottom: 50, left: 40 };
    const chartW = W - PADDING.left - PADDING.right;
    const chartH = H - PADDING.top - PADDING.bottom;

    const allValues = data.datasets.flatMap((d) => d.data);
    const maxVal = Math.max(...allValues, 1);
    const barGroupW = chartW / data.labels.length;
    const barW = Math.max(8, (barGroupW / data.datasets.length) - 4);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {/* Y axis */}
            <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={PADDING.top + chartH} stroke="#d1d5db" strokeWidth="1" />
            {/* X axis */}
            <line x1={PADDING.left} y1={PADDING.top + chartH} x2={PADDING.left + chartW} y2={PADDING.top + chartH} stroke="#d1d5db" strokeWidth="1" />

            {data.labels.map((label, gi) => {
                const groupX = PADDING.left + gi * barGroupW;
                return (
                    <g key={gi}>
                        {data.datasets.map((ds, di) => {
                            const val = ds.data[gi] ?? 0;
                            const barH = (val / maxVal) * chartH;
                            const x = groupX + di * (barW + 2) + (barGroupW - data.datasets.length * (barW + 2)) / 2;
                            const y = PADDING.top + chartH - barH;
                            return (
                                <g key={di}>
                                    <rect x={x} y={y} width={barW} height={barH} fill={COLORS[di % COLORS.length]} rx="2" />
                                    <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="9" fill="#6b7280">{val}</text>
                                </g>
                            );
                        })}
                        <text
                            x={groupX + barGroupW / 2}
                            y={PADDING.top + chartH + 14}
                            textAnchor="middle"
                            fontSize="10"
                            fill="#374151"
                        >
                            {label.length > 6 ? label.slice(0, 6) + "…" : label}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

// ── Pie chart ─────────────────────────────────────────────────

function PieChart({ data }: { data: InfographicContent }) {
    const CX = 100;
    const CY = 100;
    const R = 80;
    const values = data.datasets[0]?.data ?? [];
    const total = values.reduce((a, b) => a + b, 0) || 1;

    let cumAngle = -Math.PI / 2;
    const slices = values.map((v, i) => {
        const angle = (v / total) * 2 * Math.PI;
        const startAngle = cumAngle;
        cumAngle += angle;
        const endAngle = cumAngle;
        const x1 = CX + R * Math.cos(startAngle);
        const y1 = CY + R * Math.sin(startAngle);
        const x2 = CX + R * Math.cos(endAngle);
        const y2 = CY + R * Math.sin(endAngle);
        const midAngle = startAngle + angle / 2;
        const lx = CX + (R + 16) * Math.cos(midAngle);
        const ly = CY + (R + 16) * Math.sin(midAngle);
        const large = angle > Math.PI ? 1 : 0;
        return { x1, y1, x2, y2, lx, ly, large, pct: Math.round((v / total) * 100), label: data.labels[i] ?? "", color: COLORS[i % COLORS.length] };
    });

    return (
        <svg viewBox="0 0 280 200" className="w-full">
            {slices.map((s, i) => (
                <g key={i}>
                    <path
                        d={`M${CX},${CY} L${s.x1},${s.y1} A${R},${R} 0 ${s.large},1 ${s.x2},${s.y2} Z`}
                        fill={s.color}
                        stroke="white"
                        strokeWidth="1.5"
                    />
                </g>
            ))}
            {/* Legend */}
            {slices.map((s, i) => (
                <g key={i} transform={`translate(195, ${20 + i * 22})`}>
                    <rect x={0} y={0} width={12} height={12} fill={s.color} rx="2" />
                    <text x={16} y={10} fontSize="10" fill="#374151">
                        {s.label.slice(0, 8)} ({s.pct}%)
                    </text>
                </g>
            ))}
        </svg>
    );
}

// ── Line chart ────────────────────────────────────────────────

function LineChart({ data }: { data: InfographicContent }) {
    const W = 400;
    const H = 200;
    const PADDING = { top: 20, right: 20, bottom: 45, left: 40 };
    const chartW = W - PADDING.left - PADDING.right;
    const chartH = H - PADDING.top - PADDING.bottom;

    const allValues = data.datasets.flatMap((d) => d.data);
    const maxVal = Math.max(...allValues, 1);
    const stepX = chartW / Math.max(data.labels.length - 1, 1);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={PADDING.top + chartH} stroke="#d1d5db" strokeWidth="1" />
            <line x1={PADDING.left} y1={PADDING.top + chartH} x2={PADDING.left + chartW} y2={PADDING.top + chartH} stroke="#d1d5db" strokeWidth="1" />

            {data.datasets.map((ds, di) => {
                const pts = ds.data.map((v, i) => {
                    const x = PADDING.left + i * stepX;
                    const y = PADDING.top + chartH - (v / maxVal) * chartH;
                    return `${x},${y}`;
                });
                return (
                    <g key={di}>
                        <polyline
                            points={pts.join(" ")}
                            fill="none"
                            stroke={COLORS[di % COLORS.length]}
                            strokeWidth="2"
                            strokeLinejoin="round"
                        />
                        {ds.data.map((v, i) => {
                            const x = PADDING.left + i * stepX;
                            const y = PADDING.top + chartH - (v / maxVal) * chartH;
                            return <circle key={i} cx={x} cy={y} r="3" fill={COLORS[di % COLORS.length]} />;
                        })}
                    </g>
                );
            })}

            {data.labels.map((label, i) => (
                <text
                    key={i}
                    x={PADDING.left + i * stepX}
                    y={PADDING.top + chartH + 14}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#374151"
                >
                    {label.length > 5 ? label.slice(0, 5) + "…" : label}
                </text>
            ))}
        </svg>
    );
}

// ── Main component ────────────────────────────────────────────

export function InfographicViewer({ data }: Props) {
    const Chart = data.chart_type === "pie" ? PieChart : data.chart_type === "line" ? LineChart : BarChart;

    return (
        <div className="flex flex-col gap-3">
            <h3 className="font-semibold text-sm text-gray-700 text-center">{data.title}</h3>
            <div className="bg-white rounded-xl border border-gray-200 p-3">
                <Chart data={data} />
            </div>
            {/* Legend for bar/line */}
            {data.chart_type !== "pie" && data.datasets.length > 1 && (
                <div className="flex flex-wrap gap-3 justify-center">
                    {data.datasets.map((ds, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                            <span className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                            {ds.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
