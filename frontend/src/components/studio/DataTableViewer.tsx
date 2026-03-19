"use client";

import { DataTableContent } from "@/lib/api";

interface Props {
    data: DataTableContent;
}

export function DataTableViewer({ data }: Props) {
    return (
        <div className="flex flex-col gap-3">
            {data.title && (
                <h3 className="font-semibold text-base text-[var(--text-primary)]">{data.title}</h3>
            )}
            <div className="overflow-auto max-h-[480px] rounded border border-[var(--border-default)]">
                <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-[var(--bg-card)]">
                        <tr>
                            {data.headers.map((h, i) => (
                                <th
                                    key={i}
                                    className="px-3 py-2 text-left font-semibold text-[var(--text-secondary)] whitespace-nowrap border-b border-[var(--border-default)]"
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row, ri) => (
                            <tr
                                key={ri}
                                className={ri % 2 === 0 ? "bg-transparent" : "bg-white/5"}
                            >
                                {row.map((cell, ci) => (
                                    <td
                                        key={ci}
                                        className="px-3 py-2 text-[var(--text-secondary)] border-b border-[var(--border-default)]"
                                    >
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
