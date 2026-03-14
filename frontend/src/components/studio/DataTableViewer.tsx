"use client";

import { DataTableContent } from "@/lib/api";

interface Props {
    data: DataTableContent;
}

export function DataTableViewer({ data }: Props) {
    return (
        <div className="flex flex-col gap-3">
            {data.title && (
                <h3 className="font-semibold text-base text-gray-800">{data.title}</h3>
            )}
            <div className="overflow-auto max-h-[480px] rounded border border-gray-200">
                <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-gray-100">
                        <tr>
                            {data.headers.map((h, i) => (
                                <th
                                    key={i}
                                    className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap border-b border-gray-200"
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
                                className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}
                            >
                                {row.map((cell, ci) => (
                                    <td
                                        key={ci}
                                        className="px-3 py-2 text-gray-700 border-b border-gray-100"
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
