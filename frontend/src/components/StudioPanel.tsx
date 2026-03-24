"use client";

import { useEffect, useState, useRef } from "react";
import {
    Mic2, Video, GitBranch, FileText, CreditCard,
    HelpCircle, BarChart2, Table, X, ChevronLeft,
    RefreshCw, Loader2, CheckCircle, AlertCircle, Presentation,
    Download, Play,
} from "lucide-react";
import {
    ArtifactType,
    StudioArtifact,
    PodcastContent,
    MindMapContent,
    FlashcardsContent,
    QuizContent,
    InfographicContent,
    DataTableContent,
    ProjectInfo,
    fetchStudioArtifacts,
    fetchStudioArtifact,
    generateStudioArtifact,
} from "@/lib/api";
import { PodcastViewer } from "./studio/PodcastViewer";
import { SlidesViewer } from "./studio/SlidesViewer";
import { VideoScriptViewer } from "./studio/VideoScriptViewer";
import { MindMapViewer } from "./studio/MindMapViewer";
import { ReportViewer } from "./studio/ReportViewer";
import { FlashcardsViewer } from "./studio/FlashcardsViewer";
import { QuizViewer } from "./studio/QuizViewer";
import { InfographicViewer } from "./studio/InfographicViewer";
import { DataTableViewer } from "./studio/DataTableViewer";

// ── Config ────────────────────────────────────────────────────

interface ArtifactConfig {
    type: ArtifactType;
    icon: React.ElementType;
    label: string;
}

const CONFIGS: ArtifactConfig[] = [
    { type: "podcast",      icon: Mic2,         label: "語音摘要" },
    { type: "slides",       icon: Presentation, label: "簡報" },
    { type: "video_script", icon: Video,        label: "影片摘要" },
    { type: "mindmap",      icon: GitBranch,    label: "心智圖" },
    { type: "report",       icon: FileText,     label: "報告" },
    { type: "flashcards",   icon: CreditCard,   label: "學習卡" },
    { type: "quiz",         icon: HelpCircle,   label: "測驗" },
    { type: "infographic",  icon: BarChart2,    label: "資訊圖表" },
    { type: "datatable",    icon: Table,        label: "資料表" },
];

// ── Types ─────────────────────────────────────────────────────

type ArtifactMap = Partial<Record<ArtifactType, StudioArtifact>>;

interface Props {
    activeProject: ProjectInfo;
    onClose: () => void;
    onAskQuestion?: (question: string) => void;
}

// ── Full viewer dispatcher ─────────────────────────────────────

function ArtifactViewer({ artifact, onAskQuestion }: { artifact: StudioArtifact; onAskQuestion?: (q: string) => void }) {
    if (artifact.status !== "done") return null;

    if (artifact.artifact_type === "slides") {
        return <SlidesViewer code={artifact.content_text} artifactId={artifact.id} />;
    }

    if (artifact.artifact_type === "report") {
        return <ReportViewer markdown={artifact.content_text} />;
    }
    if (artifact.artifact_type === "video_script") {
        return <VideoScriptViewer script={artifact.content_text} />;
    }

    try {
        const data = JSON.parse(artifact.content_json);
        switch (artifact.artifact_type) {
            case "podcast":
                return <PodcastViewer data={data as PodcastContent} />;
            case "mindmap":
                return <MindMapViewer data={data as MindMapContent} onAskQuestion={onAskQuestion} />;
            case "flashcards":
                return <FlashcardsViewer data={data as FlashcardsContent} />;
            case "quiz":
                return <QuizViewer data={data as QuizContent} />;
            case "infographic":
                return <InfographicViewer data={data as InfographicContent} />;
            case "datatable":
                return <DataTableViewer data={data as DataTableContent} />;
            default:
                return <pre className="text-xs whitespace-pre-wrap text-[var(--text-secondary)]">{artifact.content_text || artifact.content_json}</pre>;
        }
    } catch {
        return <pre className="text-xs whitespace-pre-wrap text-gray-600">{artifact.content_text}</pre>;
    }
}

// ── Preview card (below grid) ─────────────────────────────────

function ArtifactPreview({
    config,
    artifact,
    onView,
    onGenerate,
    onRetry,
}: {
    config: ArtifactConfig;
    artifact?: StudioArtifact;
    onView: () => void;
    onGenerate: () => void;
    onRetry: () => void;
}) {
    const Icon = config.icon;
    const status = artifact?.status ?? "idle";

    if (status === "generating") {
        return (
            <div className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                    <span className="text-sm font-medium text-[var(--text-primary)]">{config.label} — 生成中</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                    <div className="h-full w-1/2 rounded-full bg-blue-500 animate-pulse" />
                </div>
                {artifact?.progress_message && (
                    <p className="text-xs text-blue-400">{artifact.progress_message}</p>
                )}
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-[var(--text-primary)]">{config.label} — 生成失敗</span>
                </div>
                {artifact?.error_message && (
                    <p className="text-xs text-red-400">{artifact.error_message}</p>
                )}
                <button
                    onClick={onRetry}
                    className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-xs text-red-400 transition-colors"
                >
                    <RefreshCw className="w-3.5 h-3.5" /> 重新生成
                </button>
            </div>
        );
    }

    if (status === "done") {
        // Slides: show first thumbnail + download button
        if (artifact?.artifact_type === "slides") {
            const thumbSrc = `/thumbnails/${artifact.id}/slide_000.jpg`;
            const downloadUrl = `/thumbnails/${artifact.id}/slides.pptx`;
            return (
                <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 flex flex-col gap-3">
                    <div className="relative w-full rounded-lg overflow-hidden" style={{ paddingBottom: "56.25%" }}>
                        <img
                            src={thumbSrc}
                            alt="簡報預覽"
                            className="absolute inset-0 w-full h-full object-cover"
                        />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[var(--text-muted)]">點擊查看所有投影片</span>
                        <div className="flex items-center gap-2">
                            <a
                                href={downloadUrl}
                                download="簡報.pptx"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                            >
                                <Download className="w-3.5 h-3.5" /> 下載
                            </a>
                            <button
                                onClick={onView}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-xs text-white transition-colors"
                            >
                                <Play className="w-3 h-3" /> 查看簡報
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        // Other artifacts: text preview (first 120 chars)
        const preview = (() => {
            if (artifact?.content_text) return artifact.content_text.slice(0, 120);
            try {
                return JSON.stringify(JSON.parse(artifact?.content_json ?? "")).slice(0, 120);
            } catch {
                return "";
            }
        })();

        return (
            <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                    <span className="text-sm font-medium text-[var(--text-primary)]">{config.label}</span>
                </div>
                {preview && (
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-3">{preview}…</p>
                )}
                <button
                    onClick={onView}
                    className="self-start flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-xs text-white transition-colors"
                >
                    <Play className="w-3 h-3" /> 查看完整內容
                </button>
            </div>
        );
    }

    // idle
    return (
        <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                <span className="text-sm font-medium text-[var(--text-primary)]">{config.label}</span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">尚未生成。點擊下方按鈕開始。</p>
            <button
                onClick={onGenerate}
                className="self-start px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-xs text-white transition-colors"
            >
                生成
            </button>
        </div>
    );
}

// ── Grid card ─────────────────────────────────────────────────

function GridCard({
    config,
    artifact,
    isFocused,
    onClick,
}: {
    config: ArtifactConfig;
    artifact?: StudioArtifact;
    isFocused: boolean;
    onClick: () => void;
}) {
    const Icon = config.icon;
    const status = artifact?.status ?? "idle";

    const badge = () => {
        if (status === "generating") return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
        if (status === "done") return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
        if (status === "error") return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
        return null;
    };

    const borderCls = isFocused
        ? "border-blue-500/60 bg-blue-500/10 ring-2 ring-blue-500/30"
        : status === "done"
        ? "border-green-500/40 bg-green-500/10 hover:bg-green-500/20"
        : status === "error"
        ? "border-red-500/40 bg-red-500/10 hover:bg-red-500/20"
        : status === "generating"
        ? "border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20"
        : "border-[var(--border-default)] bg-[var(--bg-card)] hover:bg-[var(--bg-hover)]";

    return (
        <button
            onClick={onClick}
            className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 transition-colors cursor-pointer ${borderCls}`}
        >
            {badge() && (
                <span className="absolute top-1.5 right-1.5">{badge()}</span>
            )}
            <Icon className="w-5 h-5 text-[var(--text-muted)]" />
            <span className="text-xs text-[var(--text-secondary)] font-medium">{config.label}</span>
        </button>
    );
}

// ── Main panel ────────────────────────────────────────────────

export function StudioPanel({ activeProject, onClose, onAskQuestion }: Props) {
    const [artifacts, setArtifacts] = useState<ArtifactMap>({});
    const [focused, setFocused] = useState<ArtifactType | null>(null);
    const [selected, setSelected] = useState<ArtifactType | null>(null);
    const [error, setError] = useState("");
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Load all existing artifacts on mount / project change
    useEffect(() => {
        fetchStudioArtifacts(activeProject.id)
            .then((list) => {
                const map: ArtifactMap = {};
                for (const a of list) map[a.artifact_type as ArtifactType] = a;
                setArtifacts(map);
            })
            .catch(() => {});
    }, [activeProject.id]);

    // Poll generating artifacts every 3 seconds
    useEffect(() => {
        const hasGenerating = Object.values(artifacts).some((a) => a?.status === "generating");
        if (hasGenerating && !pollingRef.current) {
            pollingRef.current = setInterval(async () => {
                const generating = Object.values(artifacts).filter((a) => a?.status === "generating");
                for (const a of generating) {
                    try {
                        const updated = await fetchStudioArtifact(activeProject.id, a!.artifact_type as ArtifactType);
                        setArtifacts((prev) => ({ ...prev, [updated.artifact_type]: updated }));
                    } catch {
                        // ignore transient network errors
                    }
                }
            }, 3000);
        } else if (!hasGenerating && pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [artifacts, activeProject.id]);

    const handleCardClick = async (type: ArtifactType) => {
        const a = artifacts[type];
        setFocused(type);
        if (a?.status === "done" || a?.status === "generating") return;
        if (a?.status === "error") {
            await triggerGenerate(type, true);
            return;
        }
        await triggerGenerate(type, false);
    };

    const triggerGenerate = async (type: ArtifactType, force: boolean) => {
        setError("");
        try {
            const artifact = await generateStudioArtifact(activeProject.id, type, force);
            setArtifacts((prev) => ({ ...prev, [type]: artifact }));
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
        }
    };

    const selectedArtifact = selected ? artifacts[selected] : undefined;
    const focusedConfig = focused ? CONFIGS.find((c) => c.type === focused) : undefined;
    const focusedArtifact = focused ? artifacts[focused] : undefined;

    return (
        <div className="flex flex-col h-full w-[480px] flex-shrink-0 border-l border-[var(--border-default)] bg-[var(--bg-secondary)]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)]">
                {selected ? (
                    <button
                        onClick={() => setSelected(null)}
                        className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        {CONFIGS.find((c) => c.type === selected)?.label}
                    </button>
                ) : (
                    <h2 className="font-semibold text-[var(--text-primary)]">工作室</h2>
                )}
                <div className="flex items-center gap-2">
                    {selected && (
                        <button
                            onClick={() => triggerGenerate(selected, true)}
                            title="重新生成"
                            className="p-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            <RefreshCw className="w-4 h-4 text-[var(--text-muted)]" />
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded hover:bg-[var(--bg-hover)] transition-colors"
                        aria-label="關閉工作室"
                    >
                        <X className="w-4 h-4 text-[var(--text-muted)]" />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">
                {error && (
                    <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
                        {error}
                    </div>
                )}

                {selected && selectedArtifact ? (
                    // Full viewer mode
                    selectedArtifact.status === "generating" ? (
                        <div className="flex flex-col items-center gap-3 py-16 text-[var(--text-muted)]">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                            <p className="text-sm">正在生成中，請稍候…</p>
                            {selectedArtifact.progress_message && (
                                <p className="text-xs text-blue-400">{selectedArtifact.progress_message}</p>
                            )}
                        </div>
                    ) : selectedArtifact.status === "error" ? (
                        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-400">
                            生成失敗：{selectedArtifact.error_message}
                        </div>
                    ) : (
                        <ArtifactViewer artifact={selectedArtifact} onAskQuestion={onAskQuestion} />
                    )
                ) : (
                    // Grid + preview mode
                    <>
                        <p className="text-xs text-[var(--text-muted)] mb-3">
                            點擊格子生成 AI 內容；完成後在下方預覽，點擊查看完整內容。
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            {CONFIGS.map((cfg) => (
                                <GridCard
                                    key={cfg.type}
                                    config={cfg}
                                    artifact={artifacts[cfg.type]}
                                    isFocused={focused === cfg.type}
                                    onClick={() => handleCardClick(cfg.type)}
                                />
                            ))}
                        </div>

                        {focused && focusedConfig && (
                            <ArtifactPreview
                                config={focusedConfig}
                                artifact={focusedArtifact}
                                onView={() => setSelected(focused)}
                                onGenerate={() => triggerGenerate(focused, false)}
                                onRetry={() => triggerGenerate(focused, true)}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
