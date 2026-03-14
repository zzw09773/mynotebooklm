"use client";

import ReactMarkdown from "react-markdown";

interface Props {
    markdown: string;
}

export function ReportViewer({ markdown }: Props) {
    return (
        <div className="markdown-content prose prose-sm max-w-none overflow-y-auto max-h-[520px] pr-1">
            <ReactMarkdown>{markdown}</ReactMarkdown>
        </div>
    );
}
