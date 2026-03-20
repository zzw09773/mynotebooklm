"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";

interface Props {
    /** PptxGenJS JavaScript code stored in artifact.content_text */
    code: string;
    artifactId: number;
    title?: string;
}

function thumbUrl(artifactId: number, index: number): string {
    return `/thumbnails/${artifactId}/slide_${String(index).padStart(3, "0")}.jpg`;
}

/** Probe how many JPEG thumbnails exist for this artifact by loading images. */
async function probeSlideCount(artifactId: number): Promise<number> {
    let count = 0;
    while (count < 60) {
        const ok = await new Promise<boolean>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = thumbUrl(artifactId, count);
        });
        if (!ok) break;
        count++;
    }
    return count;
}

export function SlidesViewer({ artifactId, title }: Props) {
    const [index, setIndex] = useState(0);
    const [slideCount, setSlideCount] = useState<number | null>(null);

    useEffect(() => {
        setIndex(0);
        probeSlideCount(artifactId).then(setSlideCount);
    }, [artifactId]);

    const downloadUrl = `/thumbnails/${artifactId}/slides.pptx`;

    if (slideCount === null) {
        return (
            <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                正在載入縮圖…
            </div>
        );
    }

    if (slideCount === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                縮圖生成中，請稍後重新整理…
            </div>
        );
    }

    const clamp = (i: number) => Math.max(0, Math.min(slideCount - 1, i));

    return (
        <div className="flex flex-col gap-4">
            {/* Title + download */}
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-gray-800">{title || "簡報"}</h3>
                <a
                    href={downloadUrl}
                    download={`${title || "簡報"}.pptx`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                    title="下載 PPTX"
                >
                    <Download className="w-3.5 h-3.5" />
                    下載
                </a>
            </div>

            {/* Slide thumbnail */}
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                <img
                    key={index}
                    src={thumbUrl(artifactId, index)}
                    alt={`投影片 ${index + 1}`}
                    className="absolute inset-0 w-full h-full object-cover rounded-xl border border-gray-200 shadow-sm"
                />
            </div>

            {/* Page counter */}
            <div className="text-center text-xs text-gray-400">
                {index + 1} / {slideCount}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => setIndex(clamp(index - 1))}
                    disabled={index === 0}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-sm transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" /> 上一頁
                </button>
                <div className="flex gap-1 flex-wrap justify-center max-w-xs">
                    {Array.from({ length: slideCount }, (_, i) => (
                        <button
                            key={i}
                            onClick={() => setIndex(i)}
                            className={`w-2 h-2 rounded-full transition-colors ${
                                i === index ? "bg-blue-500" : "bg-gray-300 hover:bg-gray-400"
                            }`}
                        />
                    ))}
                </div>
                <button
                    onClick={() => setIndex(clamp(index + 1))}
                    disabled={index === slideCount - 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-sm transition-colors"
                >
                    下一頁 <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
