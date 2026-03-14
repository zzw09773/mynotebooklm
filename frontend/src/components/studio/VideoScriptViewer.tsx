"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface Props {
    script: string;
}

export function VideoScriptViewer({ script }: Props) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(script);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex justify-end">
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "已複製" : "複製全文"}
                </button>
            </div>
            <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 rounded border border-gray-200 p-4 overflow-y-auto max-h-[480px] leading-relaxed font-sans">
                {script}
            </pre>
        </div>
    );
}
