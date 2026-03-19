"use client";

import { useState } from "react";
import { QuizContent } from "@/lib/api";

interface Props {
    data: QuizContent;
}

export function QuizViewer({ data }: Props) {
    const [current, setCurrent] = useState(0);
    const [selected, setSelected] = useState<number | null>(null);
    const [showExpl, setShowExpl] = useState(false);
    const [score, setScore] = useState(0);
    const [finished, setFinished] = useState(false);

    const question = data.questions[current];
    const total = data.questions.length;

    const handleSelect = (idx: number) => {
        if (selected !== null) return;
        setSelected(idx);
        setShowExpl(true);
        if (idx === question.answer) setScore((s) => s + 1);
    };

    const handleNext = () => {
        if (current + 1 >= total) {
            setFinished(true);
        } else {
            setCurrent((c) => c + 1);
            setSelected(null);
            setShowExpl(false);
        }
    };

    const handleRestart = () => {
        setCurrent(0);
        setSelected(null);
        setShowExpl(false);
        setScore(0);
        setFinished(false);
    };

    if (finished) {
        return (
            <div className="flex flex-col items-center gap-4 py-8">
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                    {score} / {total}
                </p>
                <p className="text-[var(--text-muted)] text-sm">
                    {score === total ? "完美！全部答對 🎉" : score >= total * 0.7 ? "答得不錯！" : "繼續加油！"}
                </p>
                <button
                    onClick={handleRestart}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
                >
                    重新測驗
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Progress */}
            <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-card)]">
                    <div
                        className="h-1.5 rounded-full bg-blue-400 transition-all"
                        style={{ width: `${((current + 1) / total) * 100}%` }}
                    />
                </div>
                <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">{current + 1} / {total}</span>
            </div>

            <p className="font-semibold text-[var(--text-primary)] text-base leading-relaxed">{question.q}</p>

            <div className="flex flex-col gap-2">
                {question.options.map((opt, i) => {
                    let cls = "rounded-lg border px-4 py-3 text-sm text-left transition-colors ";
                    if (selected === null) {
                        cls += "border-[var(--border-default)] text-[var(--text-secondary)] hover:border-blue-500/50 hover:bg-blue-500/10 cursor-pointer";
                    } else if (i === question.answer) {
                        cls += "border-green-500/50 bg-green-500/10 text-green-400 font-medium";
                    } else if (i === selected) {
                        cls += "border-red-500/50 bg-red-500/10 text-red-400";
                    } else {
                        cls += "border-[var(--border-default)] text-[var(--text-muted)]";
                    }
                    return (
                        <button key={i} className={cls} onClick={() => handleSelect(i)}>
                            <span className="font-medium mr-2">{["A", "B", "C", "D"][i]}.</span>
                            {opt}
                        </button>
                    );
                })}
            </div>

            {showExpl && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-400">
                    <span className="font-semibold">解析：</span>{question.explanation}
                </div>
            )}

            {selected !== null && (
                <button
                    onClick={handleNext}
                    className="self-end px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                >
                    {current + 1 >= total ? "查看結果" : "下一題"}
                </button>
            )}
        </div>
    );
}
