"use client";

import React, { useRef } from "react";
import {
    FileText, FileUp, Loader2, Trash2, ChevronLeft, MessageSquare,
    ClipboardList, ChevronDown, ChevronUp, Plus,
} from "lucide-react";
import { DocumentInfo, ConversationInfo, SummaryInfo, fetchSummary } from "@/lib/api";
import { ProjectInfo } from "@/lib/api";

interface SidebarProps {
    activeProject: ProjectInfo;
    documents: DocumentInfo[];
    conversations: ConversationInfo[];
    activeConversation: ConversationInfo | null;
    isUploading: boolean;
    dragActive: boolean;
    expandedGuide: string | null;
    summaries: Record<string, SummaryInfo>;
    onUpload: (files: FileList | File[]) => void;
    onDeleteDocument: (collectionName: string) => void;
    onExpandGuide: (key: string | null) => void;
    onSummaryLoaded: (key: string, summary: SummaryInfo) => void;
    onLoadConversation: (conv: ConversationInfo) => void;
    onNewConversation: () => void;
    onDeleteConversation: (id: number) => void;
    onBack: () => void;
    onClose: () => void;
    onDragEvent: (e: React.DragEvent) => void;
}

export function Sidebar({
    activeProject, documents, conversations, activeConversation,
    isUploading, dragActive, expandedGuide, summaries,
    onUpload, onDeleteDocument, onExpandGuide, onSummaryLoaded,
    onLoadConversation, onNewConversation, onDeleteConversation,
    onBack, onClose, onDragEvent,
}: SidebarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onDragEvent(e);
        if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files);
    };

    return (
        <aside className="flex flex-col border-r border-[var(--border-default)] bg-[var(--bg-secondary)] transition-all duration-300 w-80">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
                <div className="flex items-center gap-2">
                    <button
                        onClick={onBack}
                        className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors"
                        title="返回專案列表"
                        aria-label="返回專案列表"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <h1 className="text-base font-semibold text-white tracking-tight truncate max-w-[180px]">
                        {activeProject.name}
                    </h1>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors"
                    aria-label="收合側邊欄"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
            </div>

            {/* Upload */}
            <div className="p-4">
                <div
                    onDragEnter={onDragEvent}
                    onDragLeave={onDragEvent}
                    onDragOver={onDragEvent}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center gap-2 p-5 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${
                        dragActive
                            ? "border-primary-400 bg-primary-500/10"
                            : "border-[var(--border-light)] hover:border-primary-500/50 hover:bg-[var(--bg-hover)]"
                    }`}
                    role="button"
                    tabIndex={0}
                    aria-label="上傳文件"
                    onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                >
                    {isUploading ? (
                        <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
                    ) : (
                        <FileUp className="w-6 h-6 text-[var(--text-muted)]" />
                    )}
                    <span className="text-sm text-[var(--text-secondary)]">
                        {isUploading ? "正在處理文件..." : "點擊或拖曳上傳 PDF / 圖片"}
                    </span>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && onUpload(e.target.files)}
                    aria-hidden="true"
                />
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-6">
                {/* Documents */}
                <div>
                    <p className="px-2 py-1 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                        來源文件 ({documents.length})
                    </p>
                    {documents.length === 0 ? (
                        <div className="mt-4 text-center text-sm text-[var(--text-muted)] px-4">
                            <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            尚未上傳任何文件
                        </div>
                    ) : (
                        <ul className="mt-1 space-y-1">
                            {documents.map((doc) => (
                                <React.Fragment key={doc.collection_name}>
                                    <li className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-[var(--bg-hover)] group transition-colors">
                                        <FileText className="w-4 h-4 text-primary-400 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-[var(--text-primary)] truncate">{doc.filename}</p>
                                            <p className="text-xs text-[var(--text-muted)]">
                                                {doc.status === "processing" ? "處理中..." :
                                                    doc.status === "error" ? "❌ 處理失敗" :
                                                        `${doc.total_pages} 頁 · ${doc.total_chunks} 段落`}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => onDeleteDocument(doc.collection_name)}
                                            aria-label={`刪除 ${doc.filename}`}
                                            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-all"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </li>
                                    {/* Study Guide */}
                                    <li className="px-3">
                                        <button
                                            onClick={() => {
                                                const key = doc.collection_name;
                                                if (expandedGuide === key) {
                                                    onExpandGuide(null);
                                                } else {
                                                    onExpandGuide(key);
                                                    if (!summaries[key]) {
                                                        fetchSummary(key)
                                                            .then((s) => onSummaryLoaded(key, s))
                                                            .catch(() =>
                                                                onSummaryLoaded(key, {
                                                                    collection_name: key, status: "error",
                                                                    summary_text: "", key_points: [], faqs: [],
                                                                    error_message: "載入失敗",
                                                                }),
                                                            );
                                                    }
                                                }
                                            }}
                                            className="flex items-center gap-1.5 w-full text-xs text-primary-400 hover:text-primary-300 py-1 transition-colors"
                                            aria-expanded={expandedGuide === doc.collection_name}
                                        >
                                            <ClipboardList className="w-3 h-3" />
                                            學習指南
                                            {expandedGuide === doc.collection_name
                                                ? <ChevronUp className="w-3 h-3 ml-auto" />
                                                : <ChevronDown className="w-3 h-3 ml-auto" />}
                                        </button>
                                        {expandedGuide === doc.collection_name && <StudyGuide summary={summaries[doc.collection_name]} />}
                                    </li>
                                </React.Fragment>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Conversations */}
                <div>
                    <p className="px-2 py-1 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider flex justify-between items-center">
                        <span>歷史對話 ({conversations.length})</span>
                        <button
                            onClick={onNewConversation}
                            className="p-1 rounded-md hover:bg-[var(--bg-hover)] text-primary-400 transition-colors"
                            aria-label="新對話"
                        >
                            <Plus className="w-3.5 h-3.5" />
                        </button>
                    </p>
                    <div className="mt-1 space-y-1">
                        <button
                            onClick={onNewConversation}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                                !activeConversation ? "bg-primary-500/10 text-primary-400" : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                            }`}
                        >
                            <MessageSquare className="w-4 h-4 shrink-0" />
                            <span className="truncate">新對話...</span>
                        </button>
                        {conversations.map((conv) => (
                            <div key={conv.id} className="group relative">
                                <button
                                    onClick={() => onLoadConversation(conv)}
                                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors text-sm ${
                                        activeConversation?.id === conv.id ? "bg-primary-500/10 text-primary-400" : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                                    }`}
                                >
                                    <MessageSquare className="w-4 h-4 shrink-0" />
                                    <span className="truncate flex-1 text-left">{conv.title}</span>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id); }}
                                    aria-label={`刪除對話 ${conv.title}`}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-all"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </aside>
    );
}

function StudyGuide({ summary }: { summary: SummaryInfo | undefined }) {
    if (!summary || summary.status === "pending" || summary.status === "generating") {
        return (
            <div className="mb-2 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs">
                <div className="flex items-center gap-2 text-[var(--text-muted)]">
                    <Loader2 className="w-3 h-3 animate-spin" /> 正在生成學習指南...
                </div>
            </div>
        );
    }
    if (summary.status === "error") {
        return (
            <div className="mb-2 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs text-red-400">
                ⚠️ {summary.error_message || "生成失敗"}
            </div>
        );
    }
    return (
        <div className="mb-2 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs space-y-2">
            {summary.summary_text && (
                <div>
                    <p className="font-semibold text-[var(--text-secondary)] mb-1">📝 摘要</p>
                    <p className="text-[var(--text-primary)] leading-relaxed">{summary.summary_text}</p>
                </div>
            )}
            {summary.key_points.length > 0 && (
                <div>
                    <p className="font-semibold text-[var(--text-secondary)] mb-1">💡 重點整理</p>
                    <ul className="list-disc list-inside space-y-0.5 text-[var(--text-primary)]">
                        {summary.key_points.map((kp, i) => <li key={i}>{kp}</li>)}
                    </ul>
                </div>
            )}
            {summary.faqs.length > 0 && (
                <div>
                    <p className="font-semibold text-[var(--text-secondary)] mb-1">❓ 常見問題</p>
                    <div className="space-y-1.5">
                        {summary.faqs.map((faq, i) => (
                            <div key={i}>
                                <p className="text-[var(--text-secondary)] font-medium">Q: {faq.q}</p>
                                <p className="text-[var(--text-primary)] ml-3">A: {faq.a}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
