"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { Settings, X, Check, Loader2 } from "lucide-react";
import { AppSettings, ModelInfo } from "@/lib/api";

interface SettingsModalProps {
    settings: AppSettings | null;
    settingsForm: Partial<AppSettings>;
    availableModels: ModelInfo[];
    loadingModels: boolean;
    savingSettings: boolean;
    onFormChange: (update: Partial<AppSettings>) => void;
    onSave: () => void;
    onCancel: () => void;
}

export function SettingsModal({
    settings,
    settingsForm,
    availableModels,
    loadingModels,
    savingSettings,
    onFormChange,
    onSave,
    onCancel,
}: SettingsModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const firstFocusRef = useRef<HTMLInputElement>(null);

    // Focus first element on open
    useEffect(() => {
        firstFocusRef.current?.focus();
    }, []);

    // Escape key to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCancel();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onCancel]);

    // Focus trap
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key !== "Tab" || !dialogRef.current) return;
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
            'button, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }, []);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-title"
                className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[85vh] flex flex-col animate-slide-up"
                onKeyDown={handleKeyDown}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
                    <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-primary-400" />
                        <h3 id="settings-title" className="text-sm font-semibold text-white">模型設定</h3>
                    </div>
                    <button
                        onClick={onCancel}
                        aria-label="關閉設定"
                        className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Form */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    <div>
                        <label htmlFor="api-url" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">API Base URL</label>
                        <input
                            id="api-url"
                            ref={firstFocusRef}
                            type="text"
                            value={settingsForm.llm_api_base_url || ""}
                            onChange={(e) => onFormChange({ ...settingsForm, llm_api_base_url: e.target.value })}
                            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:border-primary-500/50 outline-none transition-colors"
                            placeholder="https://your-llm-server/v1"
                        />
                    </div>

                    <div>
                        <label htmlFor="api-key" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">API Key</label>
                        <input
                            id="api-key"
                            type="password"
                            value={settingsForm.llm_api_key || ""}
                            onChange={(e) => onFormChange({ ...settingsForm, llm_api_key: e.target.value })}
                            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:border-primary-500/50 outline-none transition-colors"
                            placeholder="sk-..."
                        />
                    </div>

                    <div>
                        <label htmlFor="llm-model" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">對話模型</label>
                        {loadingModels ? (
                            <div className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-muted)]">
                                <Loader2 className="w-4 h-4 animate-spin" /> 載入模型列表中...
                            </div>
                        ) : (
                            <select
                                id="llm-model"
                                value={settingsForm.llm_model || ""}
                                onChange={(e) => onFormChange({ ...settingsForm, llm_model: e.target.value })}
                                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:border-primary-500/50 outline-none transition-colors"
                            >
                                {availableModels.length === 0 && settingsForm.llm_model && (
                                    <option value={settingsForm.llm_model}>{settingsForm.llm_model}</option>
                                )}
                                {availableModels.map((m) => (
                                    <option key={m.id} value={m.id}>{m.id}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div>
                        <label htmlFor="embedding-model" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">嵌入模型 (Embedding)</label>
                        <select
                            id="embedding-model"
                            value={settingsForm.embedding_model || ""}
                            onChange={(e) => onFormChange({ ...settingsForm, embedding_model: e.target.value })}
                            className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:border-primary-500/50 outline-none transition-colors"
                        >
                            {availableModels.length === 0 && settingsForm.embedding_model && (
                                <option value={settingsForm.embedding_model}>{settingsForm.embedding_model}</option>
                            )}
                            {availableModels.map((m) => (
                                <option key={m.id} value={m.id}>{m.id}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="vision-model" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                            視覺模型 (Vision) <span className="text-[var(--text-muted)]">— 用於 OCR 補充理解與投影片品質檢查</span>
                        </label>
                        {loadingModels ? (
                            <div className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-muted)]">
                                <Loader2 className="w-4 h-4 animate-spin" /> 載入模型列表中...
                            </div>
                        ) : (
                            <select
                                id="vision-model"
                                value={settingsForm.vision_model || ""}
                                onChange={(e) => onFormChange({ ...settingsForm, vision_model: e.target.value })}
                                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:border-primary-500/50 outline-none transition-colors"
                            >
                                <option value="">（不啟用 VLM）</option>
                                {availableModels.length === 0 && settingsForm.vision_model && (
                                    <option value={settingsForm.vision_model}>{settingsForm.vision_model}</option>
                                )}
                                {availableModels.map((m) => (
                                    <option key={m.id} value={m.id}>{m.id}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div>
                        <label htmlFor="temperature" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                            Temperature: {settingsForm.temperature?.toFixed(2) ?? "0.10"}
                        </label>
                        <input
                            id="temperature"
                            type="range"
                            min="0" max="1" step="0.05"
                            value={settingsForm.temperature ?? 0.1}
                            onChange={(e) => onFormChange({ ...settingsForm, temperature: parseFloat(e.target.value) })}
                            className="w-full accent-primary-500"
                        />
                        <div className="flex justify-between text-xs text-[var(--text-muted)] mt-0.5">
                            <span>精確</span><span>有創意</span>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="top-k" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">檢索數量 (Top-K)</label>
                        <input
                            id="top-k"
                            type="number"
                            min="1" max="20"
                            value={settingsForm.top_k ?? 5}
                            onChange={(e) => onFormChange({ ...settingsForm, top_k: parseInt(e.target.value) || 5 })}
                            className="w-20 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:border-primary-500/50 outline-none transition-colors"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-default)]">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={onSave}
                        disabled={savingSettings}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50 transition-colors"
                    >
                        {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        儲存
                    </button>
                </div>
            </div>
        </div>
    );
}
