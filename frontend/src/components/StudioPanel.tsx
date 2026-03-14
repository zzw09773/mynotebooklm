"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
    Mic2, Video, GitBranch, FileText, CreditCard,
    HelpCircle, BarChart2, Table, X, ChevronLeft,
    RefreshCw, Loader2, CheckCircle, AlertCircle, Presentation,
} from "lucide-react";
import {
    ArtifactType,
    StudioArtifact,
    PodcastContent,
    SlidesContent,
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
}

// ── Viewer dispatcher ─────────────────────────────────────────

function ArtifactViewer({ artifact }: { artifact: StudioArtifact }) {
    if (artifact.status !== "done") return null;

    if (artifact.artifact_type === "video_script" || artifact.artifact_type === "report") {
        // text-only types
        if (artifact.artifact_type === "report") {
            return <ReportViewer markdown={artifact.content_text} />;
        }
        return <VideoScriptViewer script={artifact.content_text} />;
    }

    try {
        const data = JSON.parse(artifact.content_json);
        switch (artifact.artifact_type) {
            case "podcast":
                return <PodcastViewer data={data as PodcastContent} />;
            case "slides":
                return <SlidesViewer data={data as SlidesContent} />;
            case "mindmap":
                return <MindMapViewer data={data as MindMapContent} />;
            case "flashcards":
                return <FlashcardsViewer data={data as FlashcardsContent} />;
            case "quiz":
                return <QuizViewer data={data as QuizContent} />;
            case "infographic":
                return <InfographicViewer data={data as InfographicContent} />;
            case "datatable":
                return <DataTableViewer data={data as DataTableContent} />;
            default:
                return <pre className="text-xs whitespace-pre-wrap text-gray-600">{artifact.content_text || artifact.content_json}</pre>;
        }
    } catch {
        return <pre className="text-xs whitespace-pre-wrap text-gray-600">{artifact.content_text}</pre>;
    }
}

// ── Grid card ─────────────────────────────────────────────────

function GridCard({
    config,
    artifact,
    onClick,
}: {
    config: ArtifactConfig;
    artifact?: StudioArtifact;
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

    const borderCls =
        status === "done"
            ? "border-green-300 bg-green-50 hover:bg-green-100"
            : status === "error"
            ? "border-red-300 bg-red-50 hover:bg-red-100"
            : status === "generating"
            ? "border-blue-300 bg-blue-50"
            : "border-gray-200 bg-white hover:bg-gray-50";

    return (
        <button
            onClick={onClick}
            disabled={status === "generating"}
            className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 transition-colors ${borderCls} disabled:cursor-not-allowed`}
        >
            {badge() && (
                <span className="absolute top-1.5 right-1.5">{badge()}</span>
            )}
            <Icon className="w-5 h-5 text-gray-600" />
            <span className="text-xs text-gray-700 font-medium">{config.label}</span>
        </button>
    );
}

// ── Main panel ────────────────────────────────────────────────

export function StudioPanel({ activeProject, onClose }: Props) {
    const [artifacts, setArtifacts] = useState<ArtifactMap>({});
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
    const startPolling = useCallback(() => {
        if (pollingRef.current) return;
        pollingRef.current = setInterval(async () => {
            const generating = Object.values(artifacts).filter((a) => a?.status === "generating");
            if (generating.length === 0) {
                clearInterval(pollingRef.current!);
                pollingRef.current = null;
                return;
            }
            for (const a of generating) {
                try {
                    const updated = await fetchStudioArtifact(activeProject.id, a.artifact_type as ArtifactType);
                    setArtifacts((prev) => ({ ...prev, [updated.artifact_type]: updated }));
                } catch {
                    // ignore transient errors
                }
            }
        }, 3000);
    }, [artifacts, activeProject.id]);

    useEffect(() => {
        const hasGenerating = Object.values(artifacts).some((a) => a?.status === "generating");
        if (hasGenerating) {
            startPolling();
        } else {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        }
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [artifacts, startPolling]);

    const handleCardClick = async (type: ArtifactType) => {
        const a = artifacts[type];
        if (a?.status === "done") {
            setSelected(type);
            return;
        }
        if (a?.status === "error") {
            // Re-trigger with force
            await triggerGenerate(type, true);
            return;
        }
        // idle / pending → trigger
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

    return (
        <div className="flex flex-col h-full w-[480px] flex-shrink-0 border-l border-gray-200 bg-white">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                {selected ? (
                    <button
                        onClick={() => setSelected(null)}
                        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        {CONFIGS.find((c) => c.type === selected)?.label}
                    </button>
                ) : (
                    <h2 className="font-semibold text-gray-800">工作室</h2>
                )}
                <div className="flex items-center gap-2">
                    {selected && (
                        <button
                            onClick={() => triggerGenerate(selected, true)}
                            title="重新生成"
                            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4 text-gray-500" />
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                        aria-label="關閉工作室"
                    >
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">
                {error && (
                    <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {selected && selectedArtifact ? (
                    selectedArtifact.status === "generating" ? (
                        <div className="flex flex-col items-center gap-3 py-16 text-gray-500">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                            <p className="text-sm">正在生成中，請稍候…</p>
                        </div>
                    ) : selectedArtifact.status === "error" ? (
                        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                            生成失敗：{selectedArtifact.error_message}
                        </div>
                    ) : (
                        <ArtifactViewer artifact={selectedArtifact} />
                    )
                ) : (
                    <>
                        <p className="text-xs text-gray-500 mb-3">
                            點擊格子生成 AI 內容；完成後再次點擊查看。
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            {CONFIGS.map((cfg) => (
                                <GridCard
                                    key={cfg.type}
                                    config={cfg}
                                    artifact={artifacts[cfg.type]}
                                    onClick={() => handleCardClick(cfg.type)}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
