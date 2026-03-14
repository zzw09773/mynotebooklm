"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { PodcastContent } from "@/lib/api";

interface Props {
    data: PodcastContent;
}

export function PodcastViewer({ data }: Props) {
    const [copied, setCopied] = useState(false);

    // Interleave host_a and host_b lines
    const lines: { speaker: "A" | "B"; text: string }[] = [];
    const max = Math.max(data.host_a.length, data.host_b.length);
    for (let i = 0; i < max; i++) {
        if (i < data.host_a.length) lines.push({ speaker: "A", text: data.host_a[i] });
        if (i < data.host_b.length) lines.push({ speaker: "B", text: data.host_b[i] });
    }

    const fullText = lines
        .map((l) => `主持人 ${l.speaker}：${l.text}`)
        .join("\n\n");

    const handleCopy = async () => {
        await navigator.clipboard.writeText(fullText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex justify-end">
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "已複製" : "複製全文"}
                </button>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto max-h-[480px] pr-1">
                {lines.map((line, i) => {
                    const isA = line.speaker === "A";
                    return (
                        <div
                            key={i}
                            className={`flex gap-2 ${isA ? "flex-row" : "flex-row-reverse"}`}
                        >
                            <div
                                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${isA ? "bg-blue-500" : "bg-purple-500"}`}
                            >
                                {line.speaker}
                            </div>
                            <div
                                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm text-gray-800 leading-relaxed ${isA ? "bg-blue-50 rounded-tl-none" : "bg-purple-50 rounded-tr-none"}`}
                            >
                                {line.text}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
