"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { FlashcardsContent } from "@/lib/api";

interface Props {
    data: FlashcardsContent;
}

export function FlashcardsViewer({ data }: Props) {
    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);

    const card = data.cards[index];
    const total = data.cards.length;

    const goTo = (next: number) => {
        setIndex(next);
        setFlipped(false);
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <p className="text-xs text-gray-500">
                {index + 1} / {total}　點擊卡片翻面
            </p>

            {/* Card with CSS 3D flip */}
            <div
                className="w-full cursor-pointer"
                style={{ perspective: "1000px" }}
                onClick={() => setFlipped((f) => !f)}
            >
                <div
                    className="relative transition-transform duration-500"
                    style={{
                        transformStyle: "preserve-3d",
                        transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                        height: "200px",
                    }}
                >
                    {/* Front */}
                    <div
                        className="absolute inset-0 flex items-center justify-center rounded-xl border-2 border-blue-200 bg-blue-50 p-5 text-center"
                        style={{ backfaceVisibility: "hidden" }}
                    >
                        <p className="text-gray-800 text-base font-medium leading-relaxed">{card.front}</p>
                    </div>
                    {/* Back */}
                    <div
                        className="absolute inset-0 flex items-center justify-center rounded-xl border-2 border-green-200 bg-green-50 p-5 text-center"
                        style={{
                            backfaceVisibility: "hidden",
                            transform: "rotateY(180deg)",
                        }}
                    >
                        <p className="text-gray-800 text-sm leading-relaxed">{card.back}</p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => goTo(Math.max(0, index - 1))}
                    disabled={index === 0}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                    onClick={() => setFlipped(false)}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                    title="重置翻面"
                >
                    <RotateCcw className="w-4 h-4" />
                </button>
                <button
                    onClick={() => goTo(Math.min(total - 1, index + 1))}
                    disabled={index === total - 1}
                    className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-colors"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
