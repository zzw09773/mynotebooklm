"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { SlidesContent, SlideItem } from "@/lib/api";

interface Props {
    data: SlidesContent;
}

// ── Speaker notes toggle ──────────────────────────────────────

function SpeakerNote({ note }: { note: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border-t border-gray-100">
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-6 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            >
                <span className="text-sm leading-none">{open ? "▾" : "▸"}</span>
                演講者備忘稿
            </button>
            {open && (
                <p className="px-6 pb-4 text-xs text-gray-500 leading-relaxed">{note}</p>
            )}
        </div>
    );
}

// ── PPTX download ─────────────────────────────────────────────

async function downloadPptx(data: SlidesContent) {
    const pptxgen = (await import("pptxgenjs")).default;
    const prs = new pptxgen();
    prs.layout = "LAYOUT_WIDE";
    data.slides.forEach((slide, i) => {
        const sld = prs.addSlide();
        sld.background = { color: "FFFFFF" };
        // Title
        sld.addText(slide.title, {
            x: 0.5, y: 0.3, w: "90%", h: 0.7,
            fontSize: 24, bold: true, color: "1e293b",
        });
        // Subtitle
        if (slide.subtitle) {
            sld.addText(slide.subtitle, {
                x: 0.5, y: 1.0, w: "90%", h: 0.4,
                fontSize: 14, color: "64748b",
            });
        }
        // Bullets
        const bulletText = slide.bullets.map((b) => ({
            text: b,
            options: { bullet: { indent: 15 } },
        }));
        sld.addText(bulletText, {
            x: 0.5,
            y: slide.subtitle ? 1.5 : 1.2,
            w: "90%",
            h: "65%",
            fontSize: 13,
            color: "334155",
        });
        // Speaker notes
        if (slide.speaker_note) {
            sld.addNotes(slide.speaker_note);
        }
        // Page number
        sld.addText(`${i + 1} / ${data.slides.length}`, {
            x: "88%", y: "90%", w: "10%", h: 0.3,
            fontSize: 10, color: "94a3b8", align: "right",
        });
    });
    prs.writeFile({ fileName: `${data.title || "簡報"}.pptx` });
}

// ── Slide card ────────────────────────────────────────────────

function SlideCard({ slide, index, total }: { slide: SlideItem; index: number; total: number }) {
    return (
        <div className="rounded-xl border-2 border-gray-200 bg-white min-h-[260px] flex flex-col shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                        {index + 1} / {total}
                    </span>
                </div>
                <h4 className="font-bold text-gray-800 text-base leading-snug">{slide.title}</h4>
                {slide.subtitle && (
                    <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{slide.subtitle}</p>
                )}
            </div>
            {/* Bullets */}
            <ul className="px-6 py-4 flex flex-col gap-3 flex-1">
                {slide.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-700 leading-relaxed">
                        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                        {b}
                    </li>
                ))}
            </ul>
            {/* Speaker notes */}
            {slide.speaker_note && <SpeakerNote note={slide.speaker_note} />}
        </div>
    );
}

// ── Main ──────────────────────────────────────────────────────

export function SlidesViewer({ data }: Props) {
    const [index, setIndex] = useState(0);
    const total = data.slides.length;
    const slide = data.slides[index];

    return (
        <div className="flex flex-col gap-4">
            {/* Title + download */}
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-gray-800">{data.title}</h3>
                <button
                    onClick={() => downloadPptx(data)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                    title="下載 PPTX"
                >
                    <Download className="w-3.5 h-3.5" />
                    下載
                </button>
            </div>

            {/* Slide card */}
            <SlideCard slide={slide} index={index} total={total} />

            {/* Navigation */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    disabled={index === 0}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-sm transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" /> 上一頁
                </button>
                <div className="flex gap-1">
                    {data.slides.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setIndex(i)}
                            className={`w-2 h-2 rounded-full transition-colors ${i === index ? "bg-blue-500" : "bg-gray-300 hover:bg-gray-400"}`}
                        />
                    ))}
                </div>
                <button
                    onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                    disabled={index === total - 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-sm transition-colors"
                >
                    下一頁 <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
