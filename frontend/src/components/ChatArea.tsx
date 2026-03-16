"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    Send, Loader2, Bot, User as UserIcon, AlertCircle, X, ChevronRight, Sparkles,
    Settings, MessageSquare, Layers, Pencil, Trash2, Check,
} from "lucide-react";
import { ChatMessage, Citation, AppSettings } from "@/lib/api";

const QUICK_QUESTIONS = ["這份文件的主要內容是什麼？", "請幫我總結重點", "有什麼關鍵發現？"];

interface ChatAreaProps {
    messages: ChatMessage[];
    isStreaming: boolean;
    inputValue: string;
    errorMsg: string | null;
    sidebarOpen: boolean;
    documents: { length: number };
    settings: AppSettings | null;
    docFaqs?: { q: string; a: string }[];
    onSend: () => void;
    onInputChange: (v: string) => void;
    onErrorDismiss: () => void;
    onOpenSidebar: () => void;
    onOpenSettings: () => void;
    onOpenStudio: () => void;
    onEditMessage?: (index: number, newContent: string) => void;
    onDeleteMessage?: (index: number) => void;
    followUpSuggestions?: string[];
}

export function ChatArea({
    messages, isStreaming, inputValue, errorMsg, sidebarOpen, documents, settings, docFaqs,
    onSend, onInputChange, onErrorDismiss, onOpenSidebar, onOpenSettings, onOpenStudio,
    onEditMessage, onDeleteMessage, followUpSuggestions,
}: ChatAreaProps) {
    const chatEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState("");

    // Quick questions: use document FAQs if available, else fallback
    const quickItems = (docFaqs && docFaqs.length > 0)
        ? docFaqs.slice(0, 6).map((f) => f.q)
        : QUICK_QUESTIONS;

    // Follow-up suggestions: AI-generated after each exchange
    const followUps = followUpSuggestions && followUpSuggestions.length > 0
        ? followUpSuggestions
        : [];

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = "auto";
            ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
        }
    }, [inputValue]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    }, [onSend]);

    return (
        <main className="flex-1 flex flex-col min-w-0 relative">
            {/* Top bar */}
            <header className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-default)] bg-[var(--bg-secondary)]/80 backdrop-blur-sm">
                {!sidebarOpen && (
                    <button
                        onClick={onOpenSidebar}
                        className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors"
                        aria-label="展開側邊欄"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                )}
                <div className="flex items-center gap-2 flex-1">
                    <Sparkles className="w-4 h-4 text-primary-400" />
                    <span className="text-sm font-medium text-[var(--text-secondary)]">
                        與 <span className="text-primary-400">{documents.length} 份文件</span> 對話中
                        {settings && (
                            <span className="ml-2 text-[var(--text-muted)]">
                                · {settings.llm_model.split("/").pop()}
                            </span>
                        )}
                    </span>
                </div>
                <button
                    onClick={onOpenStudio}
                    className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-primary-400 transition-colors"
                    aria-label="開啟工作室"
                    title="工作室"
                >
                    <Layers className="w-4 h-4" />
                </button>
                <button
                    onClick={onOpenSettings}
                    className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-primary-400 transition-colors"
                    aria-label="開啟設定"
                >
                    <Settings className="w-4 h-4" />
                </button>
            </header>

            {/* Error banner */}
            {errorMsg && (
                <div className="mx-4 mt-3 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm animate-fade-in" role="alert">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {errorMsg}
                    <button onClick={onErrorDismiss} className="ml-auto p-0.5 hover:bg-red-500/20 rounded" aria-label="關閉錯誤">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500/20 to-primary-600/10 flex items-center justify-center mb-5">
                            <MessageSquare className="w-8 h-8 text-primary-400" />
                        </div>
                        <h2 className="text-xl font-semibold text-white mb-2">開始與文件對話</h2>
                        <p className="text-[var(--text-secondary)] max-w-md text-sm leading-relaxed">
                            上傳 PDF 文件後，即可針對文件內容提問。<br />
                            AI 會根據文件內容回答，並標註引用來源。
                        </p>
                        <div className="mt-6 flex flex-wrap justify-center gap-2">
                            {quickItems.map((q) => (
                                <button
                                    key={q}
                                    onClick={() => {
                                        onInputChange(q);
                                        textareaRef.current?.focus();
                                    }}
                                    className="px-3.5 py-2 text-sm rounded-full border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-primary-300 hover:border-primary-500/40 hover:bg-primary-500/5 transition-all duration-200"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="max-w-3xl mx-auto space-y-5">
                        {messages.map((msg, i) => (
                            <div
                                key={msg.id ?? `msg-${i}`}
                                className={`flex gap-3 animate-slide-up group/msg ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                {msg.role === "assistant" && (
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500/30 to-primary-600/20 flex items-center justify-center shrink-0 mt-0.5">
                                        <Bot className="w-4 h-4 text-primary-300" />
                                    </div>
                                )}
                                <div className="relative max-w-[80%]">
                                    {/* Edit/Delete buttons (user messages only) */}
                                    {msg.role === "user" && editingIndex !== i && (
                                        <div className="absolute -top-7 right-0 hidden group-hover/msg:flex items-center gap-1">
                                            <button
                                                onClick={() => { setEditingIndex(i); setEditDraft(msg.content); }}
                                                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-primary-300 transition-colors"
                                                title="編輯"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => onDeleteMessage?.(i)}
                                                className="p-1 rounded hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-colors"
                                                title="刪除"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                    <div className={`rounded-2xl px-4 py-3 ${
                                        msg.role === "user"
                                            ? "bg-primary-600 text-white"
                                            : "bg-[var(--bg-card)] border border-[var(--border-default)]"
                                    }`}>
                                    {msg.role === "assistant" ? (
                                        <div className="markdown-content text-sm leading-relaxed text-[var(--text-primary)]">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                            {isStreaming && i === messages.length - 1 && !msg.content && (
                                                <div className="flex gap-1 py-2">
                                                    <span className="typing-dot w-2 h-2 bg-primary-400 rounded-full" />
                                                    <span className="typing-dot w-2 h-2 bg-primary-400 rounded-full" />
                                                    <span className="typing-dot w-2 h-2 bg-primary-400 rounded-full" />
                                                </div>
                                            )}
                                        </div>
                                    ) : editingIndex === i ? (
                                        <div className="flex flex-col gap-2 min-w-[200px]">
                                            <textarea
                                                value={editDraft}
                                                onChange={(e) => setEditDraft(e.target.value)}
                                                className="bg-primary-700 text-white text-sm rounded-lg px-2 py-1.5 resize-none outline-none border border-primary-400/50 min-h-[60px]"
                                                autoFocus
                                            />
                                            <div className="flex gap-1.5 justify-end">
                                                <button
                                                    onClick={() => setEditingIndex(null)}
                                                    className="px-2 py-1 text-xs rounded bg-primary-700 hover:bg-primary-600 transition-colors"
                                                >
                                                    取消
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (editDraft.trim()) {
                                                            onEditMessage?.(i, editDraft.trim());
                                                            setEditingIndex(null);
                                                        }
                                                    }}
                                                    className="px-2 py-1 text-xs rounded bg-white text-primary-700 hover:bg-primary-100 transition-colors flex items-center gap-1"
                                                >
                                                    <Check className="w-3 h-3" /> 送出
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm leading-relaxed">{msg.content}</p>
                                    )}
                                    {msg.citations && msg.citations.length > 0 && (
                                        <div className="mt-3 pt-2 border-t border-[var(--border-default)]">
                                            <p className="text-xs text-[var(--text-muted)] mb-1.5">引用來源：</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {msg.citations.map((c) => (
                                                    <button
                                                        key={c.index}
                                                        onClick={() => setActiveCitation(c)}
                                                        className="citation-badge"
                                                        aria-label={`查看來源 ${c.index}`}
                                                    >
                                                        {c.index}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    </div>
                                </div>
                                {msg.role === "user" && (
                                    <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center shrink-0 mt-0.5">
                                        <UserIcon className="w-4 h-4 text-dark-300" />
                                    </div>
                                )}
                            </div>
                        ))}
                        {/* Follow-up suggestions */}
                        {!isStreaming && followUps.length > 0 && (
                            <div className="flex flex-col gap-1.5 pt-1">
                                <p className="text-xs text-[var(--text-muted)]">可能感興趣的問題：</p>
                                <div className="flex flex-wrap gap-2">
                                    {followUps.map((q) => (
                                        <button
                                            key={q}
                                            onClick={() => onInputChange(q)}
                                            className="px-3 py-1.5 text-xs rounded-full border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-primary-300 hover:border-primary-500/40 hover:bg-primary-500/5 transition-all duration-200 text-left"
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="border-t border-[var(--border-default)] bg-[var(--bg-secondary)]/80 backdrop-blur-sm px-4 py-3">
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-end gap-2 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl px-4 py-2 focus-within:border-primary-500/50 transition-colors">
                        <textarea
                            ref={textareaRef}
                            value={inputValue}
                            onChange={(e) => onInputChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="輸入問題，與文件對話..."
                            rows={1}
                            aria-label="輸入訊息"
                            className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] max-h-40 py-1"
                        />
                        <button
                            onClick={onSend}
                            disabled={!inputValue.trim() || isStreaming}
                            aria-label="送出"
                            className="p-2 rounded-xl bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shrink-0"
                        >
                            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </button>
                    </div>
                    <p className="mt-1.5 text-center text-xs text-[var(--text-muted)]">
                        AI 的回答僅基於已上傳的文件內容，並附帶引用來源。
                    </p>
                </div>
            </div>

            {/* Citation panel */}
            {activeCitation && (
                <CitationPanel citation={activeCitation} onClose={() => setActiveCitation(null)} />
            )}
        </main>
    );
}

function CitationPanel({ citation, onClose }: { citation: Citation; onClose: () => void }) {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="citation-title"
                className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col animate-slide-up"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
                    <div>
                        <h3 id="citation-title" className="text-sm font-semibold text-white">來源 {citation.index}</h3>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{citation.source_file} · 第 {citation.page_number} 頁</p>
                    </div>
                    <button onClick={onClose} aria-label="關閉引用面板" className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">
                    <div className="bg-[var(--citation-bg)] border border-[var(--citation-border)] rounded-xl p-4">
                        <p className="text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">{citation.text}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
                        <span>相關度分數：{citation.score}</span>
                        <span>段落 #{citation.chunk_index}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
