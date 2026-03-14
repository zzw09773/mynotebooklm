"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SlidesContent } from "@/lib/api";

interface Props {
    data: SlidesContent;
}

export function SlidesViewer({ data }: Props) {
    const [index, setIndex] = useState(0);
    const slide = data.slides[index];
    const total = data.slides.length;

    return (
        <div className="flex flex-col gap-4">
            <h3 className="font-bold text-base text-gray-800 text-center">{data.title}</h3>

            {/* Slide card */}
            <div className="rounded-xl border-2 border-gray-200 bg-white p-6 min-h-[220px] flex flex-col gap-4 shadow-sm">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-medium">{index + 1} / {total}</span>
                    <h4 className="font-semibold text-gray-800 text-base">{slide.title}</h4>
                </div>
                <ul className="flex flex-col gap-2">
                    {slide.bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                            {b}
                        </li>
                    ))}
                </ul>
            </div>

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
