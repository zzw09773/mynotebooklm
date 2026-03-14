"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    fetchProjects, fetchSettings, fetchDocuments, fetchConversations,
    fetchConversationMessages, createConversation, deleteConversationApi,
    updateSettings, fetchModels,
    AppSettings, ChatMessage, ConversationInfo, DocumentInfo, ModelInfo, ProjectInfo, SummaryInfo,
    streamChat,
} from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { useDocumentPolling } from "@/hooks/useDocumentPolling";
import { ProjectDashboard } from "@/components/ProjectDashboard";
import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";
import { SettingsModal } from "@/components/SettingsModal";

export default function NotebookLMPage() {
    const router = useRouter();

    // Auth guard
    useEffect(() => {
        if (!isAuthenticated()) router.replace("/login");
    }, [router]);

    // ── Core state ─────────────────────────────────────────
    const [projects, setProjects] = useState<ProjectInfo[]>([]);
    const [activeProject, setActiveProject] = useState<ProjectInfo | null>(null);
    const [documents, setDocuments] = useState<DocumentInfo[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [conversations, setConversations] = useState<ConversationInfo[]>([]);
    const [activeConversation, setActiveConversation] = useState<ConversationInfo | null>(null);
    const [inputValue, setInputValue] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [dragActive, setDragActive] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
    const [summaries, setSummaries] = useState<Record<string, SummaryInfo>>({});

    // ── Settings state ─────────────────────────────────────
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [settingsForm, setSettingsForm] = useState<Partial<AppSettings>>({});
    const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);
    const [savingSettings, setSavingSettings] = useState(false);

    const { pollDocumentStatus, stopAllPolling } = useDocumentPolling(setDocuments, setErrorMsg);

    // ── Cleanup polling on unmount ─────────────────────────
    useEffect(() => () => stopAllPolling(), [stopAllPolling]);

    // ── Bootstrap ──────────────────────────────────────────
    useEffect(() => {
        if (!isAuthenticated()) return;
        fetchProjects().then(setProjects).catch(() => {});
        fetchSettings().then((s) => { setSettings(s); setSettingsForm(s); }).catch(() => {});
    }, []);

    // ── Load on project change ─────────────────────────────
    useEffect(() => {
        if (!activeProject) {
            setDocuments([]); setMessages([]); setSummaries([]);
            setConversations([]); setActiveConversation(null);
            return;
        }
        fetchDocuments(activeProject.id).then(setDocuments).catch(() => {});
        fetchConversations(activeProject.id).then(setConversations).catch(() => {});
        setMessages([]);
    }, [activeProject]);

    // ── Upload ─────────────────────────────────────────────
    const { uploadDocument } = require("@/lib/api");
    const handleUpload = useCallback(async (files: FileList | File[]) => {
        if (!activeProject) return;
        setIsUploading(true);
        setErrorMsg(null);
        for (const file of Array.from(files)) {
            try {
                const doc = await uploadDocument(file, activeProject.id);
                setDocuments((prev: DocumentInfo[]) => [...prev, doc]);
                if (doc.status === "processing") pollDocumentStatus(doc.collection_name);
            } catch (e: unknown) {
                setErrorMsg(e instanceof Error ? e.message : "上傳失敗");
            }
        }
        setIsUploading(false);
    }, [activeProject, pollDocumentStatus]);

    // ── Delete document ────────────────────────────────────
    const { deleteDocument } = require("@/lib/api");
    const handleDeleteDocument = useCallback(async (collectionName: string) => {
        if (!activeProject) return;
        try {
            await deleteDocument(collectionName, activeProject.id);
            setDocuments((prev) => prev.filter((d) => d.collection_name !== collectionName));
        } catch {
            setErrorMsg("刪除失敗");
        }
    }, [activeProject]);

    // ── Chat ───────────────────────────────────────────────
    const handleSend = useCallback(async () => {
        const query = inputValue.trim();
        if (!query || isStreaming) return;
        setInputValue("");
        setErrorMsg(null);

        setMessages((prev: ChatMessage[]) => [...prev, { role: "user", content: query }]);
        setMessages((prev: ChatMessage[]) => [...prev, { role: "assistant", content: "", citations: [] }]);
        setIsStreaming(true);

        try {
            let convId = activeConversation?.id;
            if (!convId && activeProject) {
                const conv = await createConversation(activeProject.id, query.slice(0, 50));
                setActiveConversation(conv);
                setConversations((prev: ConversationInfo[]) => [conv, ...prev]);
                convId = conv.id;
            }
            const history = messages.map((m: ChatMessage) => ({ role: m.role, content: m.content }));
            for await (const event of streamChat(query, activeProject?.id, undefined, history, convId)) {
                if (event.type === "citations") {
                    setMessages((prev: ChatMessage[]) => {
                        const msgs = [...prev];
                        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], citations: event.citations };
                        return msgs;
                    });
                } else if (event.type === "token" && event.content) {
                    setMessages((prev: ChatMessage[]) => {
                        const msgs = [...prev];
                        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: msgs[msgs.length - 1].content + event.content };
                        return msgs;
                    });
                }
            }
        } catch (e: unknown) {
            setMessages((prev: ChatMessage[]) => {
                const msgs = [...prev];
                msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: "⚠️ 發生錯誤：" + (e instanceof Error ? e.message : "無法連線到後端服務") };
                return msgs;
            });
        } finally {
            setIsStreaming(false);
        }
    }, [inputValue, isStreaming, activeProject, activeConversation, messages]);

    // ── Conversation ───────────────────────────────────────
    const loadConversation = useCallback(async (conv: ConversationInfo) => {
        setActiveConversation(conv);
        try {
            const msgs = await fetchConversationMessages(conv.id);
            setMessages(msgs);
        } catch { setErrorMsg("載入對話失敗"); }
    }, []);

    // ── Settings ───────────────────────────────────────────
    const handleOpenSettings = useCallback(() => {
        setShowSettings(true);
        setLoadingModels(true);
        fetchModels().then(setAvailableModels).catch(() => {}).finally(() => setLoadingModels(false));
    }, []);

    const handleSaveSettings = useCallback(async () => {
        setSavingSettings(true);
        try {
            const updated = await updateSettings(settingsForm);
            setSettings(updated);
            setSettingsForm(updated);
            setShowSettings(false);
        } catch { setErrorMsg("儲存設定失敗"); }
        finally { setSavingSettings(false); }
    }, [settingsForm]);

    // ── Drag & drop ────────────────────────────────────────
    const handleDragEvent = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(e.type === "dragenter" || e.type === "dragover");
    }, []);

    // ── Auth ───────────────────────────────────────────────
    const handleLogout = useCallback(() => {
        router.push("/login");
    }, [router]);

    // ── Render: project dashboard ──────────────────────────
    if (!activeProject) {
        return (
            <>
                <ProjectDashboard
                    projects={projects}
                    onSelectProject={setActiveProject}
                    onProjectCreated={(p) => setProjects((prev) => [p, ...prev])}
                    onProjectDeleted={(id) => setProjects((prev) => prev.filter((x) => x.id !== id))}
                    onOpenSettings={handleOpenSettings}
                    onLogout={handleLogout}
                />
                {showSettings && (
                    <SettingsModal
                        settings={settings}
                        settingsForm={settingsForm}
                        availableModels={availableModels}
                        loadingModels={loadingModels}
                        savingSettings={savingSettings}
                        onFormChange={setSettingsForm}
                        onSave={handleSaveSettings}
                        onCancel={() => { setSettingsForm(settings || {}); setShowSettings(false); }}
                    />
                )}
            </>
        );
    }

    // ── Render: workspace ──────────────────────────────────
    return (
        <div className="flex h-screen overflow-hidden">
            {sidebarOpen && (
                <Sidebar
                    activeProject={activeProject}
                    documents={documents}
                    conversations={conversations}
                    activeConversation={activeConversation}
                    isUploading={isUploading}
                    dragActive={dragActive}
                    expandedGuide={expandedGuide}
                    summaries={summaries}
                    onUpload={handleUpload}
                    onDeleteDocument={handleDeleteDocument}
                    onExpandGuide={setExpandedGuide}
                    onSummaryLoaded={(key, s) => setSummaries((prev) => ({ ...prev, [key]: s }))}
                    onLoadConversation={loadConversation}
                    onNewConversation={() => { setActiveConversation(null); setMessages([]); }}
                    onDeleteConversation={async (id) => {
                        try {
                            await deleteConversationApi(id);
                            setConversations((prev: ConversationInfo[]) => prev.filter((c) => c.id !== id));
                            if (activeConversation?.id === id) { setActiveConversation(null); setMessages([]); }
                        } catch { setErrorMsg("刪除對話失敗"); }
                    }}
                    onBack={() => setActiveProject(null)}
                    onClose={() => setSidebarOpen(false)}
                    onDragEvent={handleDragEvent}
                />
            )}

            <ChatArea
                messages={messages}
                isStreaming={isStreaming}
                inputValue={inputValue}
                errorMsg={errorMsg}
                sidebarOpen={sidebarOpen}
                documents={documents}
                settings={settings}
                onSend={handleSend}
                onInputChange={setInputValue}
                onErrorDismiss={() => setErrorMsg(null)}
                onOpenSidebar={() => setSidebarOpen(true)}
                onOpenSettings={handleOpenSettings}
            />

            {showSettings && (
                <SettingsModal
                    settings={settings}
                    settingsForm={settingsForm}
                    availableModels={availableModels}
                    loadingModels={loadingModels}
                    savingSettings={savingSettings}
                    onFormChange={setSettingsForm}
                    onSave={handleSaveSettings}
                    onCancel={() => { setSettingsForm(settings || {}); setShowSettings(false); }}
                />
            )}
        </div>
    );
}
