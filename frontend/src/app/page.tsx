"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
    FileText,
    Send,
    Upload,
    Trash2,
    BookOpen,
    MessageSquare,
    Sparkles,
    X,
    ChevronLeft,
    ChevronRight,
    Loader2,
    FileUp,
    Bot,
    User,
    AlertCircle,
    Settings,
    Check,
    ClipboardList,
    ImageIcon,
    ChevronDown,
    ChevronUp,
    Plus,
} from "lucide-react";

/* ================================================================
   Types
   ================================================================ */
interface DocumentInfo {
    doc_id: string;
    collection_name: string;
    filename: string;
    total_pages: number;
    total_chunks: number;
    status: string;  // processing | ready | error
}

interface Citation {
    index: number;
    source_file: string;
    page_number: number;
    chunk_index: number;
    doc_id: string;
    text: string;
    score: number;
}

interface ConversationInfo {
    id: number;
    project_id: number;
    title: string;
    created_at: string;
    updated_at: string;
}

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    citations?: Citation[];
}

interface AppSettings {
    llm_api_base_url: string;
    llm_api_key: string;
    llm_model: string;
    embedding_model: string;
    temperature: number;
    top_k: number;
    chunk_size: number;
}

interface ModelInfo {
    id: string;
    owned_by: string | null;
}

interface ProjectInfo {
    id: number;
    name: string;
    description: string;
    created_at: string;
    updated_at: string;
    document_count: number;
}

interface SummaryInfo {
    collection_name: string;
    status: string;
    summary_text: string;
    key_points: string[];
    faqs: { q: string; a: string }[];
    error_message: string;
}

/* ================================================================
   API helpers
   ================================================================ */
const API_BASE = "/api";

// ── Project API ──────────────────────────────────────────
async function fetchProjects(): Promise<ProjectInfo[]> {
    const res = await fetch(`${API_BASE}/projects`);
    if (!res.ok) throw new Error("Failed to fetch projects");
    const data = await res.json();
    return data.projects;
}

async function createProject(name: string, description = ""): Promise<ProjectInfo> {
    const res = await fetch(`${API_BASE}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
    });
    if (!res.ok) throw new Error("Failed to create project");
    return res.json();
}

async function deleteProjectApi(projectId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/projects/${projectId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete project");
}

// ── Document API (project-scoped) ────────────────────────
async function fetchDocuments(projectId: number): Promise<DocumentInfo[]> {
    const res = await fetch(`${API_BASE}/documents?project_id=${projectId}`);
    if (!res.ok) throw new Error("Failed to fetch documents");
    const data = await res.json();
    return data.documents;
}

async function uploadDocument(file: File, projectId: number): Promise<DocumentInfo> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/documents/upload?project_id=${projectId}`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Upload failed");
    }
    return res.json();
}

async function deleteDocument(collectionName: string, projectId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/documents/${collectionName}?project_id=${projectId}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error("Delete failed");
}

async function fetchDocumentStatus(collectionName: string): Promise<{ status: string; total_pages: number; total_chunks: number; error_message: string }> {
    const res = await fetch(`${API_BASE}/documents/${collectionName}/status`);
    if (!res.ok) throw new Error("Status check failed");
    return res.json();
}

async function fetchSummary(collectionName: string): Promise<SummaryInfo> {
    const res = await fetch(`${API_BASE}/documents/${collectionName}/summary`);
    if (!res.ok) throw new Error("Summary not found");
    return res.json();
}

async function fetchSettings(): Promise<AppSettings> {
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error("Failed to fetch settings");
    return res.json();
}

async function updateSettings(update: Partial<AppSettings>): Promise<AppSettings> {
    const res = await fetch(`${API_BASE}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
    });
    if (!res.ok) throw new Error("Failed to update settings");
    return res.json();
}

async function fetchModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${API_BASE}/settings/models`);
    if (!res.ok) throw new Error("Failed to fetch models");
    const data = await res.json();
    return data.models;
}

async function* streamChat(
    query: string,
    projectId?: number,
    collectionNames?: string[],
    history?: { role: string; content: string }[],
    conversationId?: number,
): AsyncGenerator<{ type: string; content?: string; citations?: Citation[] }> {
    const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            query,
            project_id: projectId,
            collection_names: collectionNames,
            history: history || [],
            conversation_id: conversationId || null,
        }),
    });

    if (!res.ok) throw new Error("Chat request failed");
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
                try {
                    const data = JSON.parse(trimmed.slice(6));
                    yield data;
                } catch {
                    // skip malformed lines
                }
            }
        }
    }
}

// ── Conversation API ──────────────────────────────────────────────
async function createConversation(projectId: number, title: string = "新對話"): Promise<ConversationInfo> {
    const res = await fetch(`${API_BASE}/conversations/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, title }),
    });
    if (!res.ok) throw new Error("Failed to create conversation");
    return res.json();
}

async function fetchConversations(projectId: number): Promise<ConversationInfo[]> {
    const res = await fetch(`${API_BASE}/conversations/?project_id=${projectId}`);
    if (!res.ok) throw new Error("Failed to fetch conversations");
    const data = await res.json();
    return data.conversations;
}

async function deleteConversationApi(conversationId: number): Promise<void> {
    const res = await fetch(`${API_BASE}/conversations/${conversationId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete conversation");
}

async function fetchConversationMessages(conversationId: number): Promise<ChatMessage[]> {
    const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`);
    if (!res.ok) throw new Error("Failed to fetch messages");
    const data = await res.json();
    return data.messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        citations: m.citations || [],
    }));
}

/* ================================================================
   Main Page Component
   ================================================================ */
export default function NotebookLMPage() {
    // ── State ──────────────────────────────────────────────
    const [projects, setProjects] = useState<ProjectInfo[]>([]);
    const [activeProject, setActiveProject] = useState<ProjectInfo | null>(null);
    const [newProjectName, setNewProjectName] = useState("");
    const [documents, setDocuments] = useState<DocumentInfo[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [settingsForm, setSettingsForm] = useState<Partial<AppSettings>>({});
    const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
    const [savingSettings, setSavingSettings] = useState(false);
    const [loadingModels, setLoadingModels] = useState(false);
    const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
    const [summaries, setSummaries] = useState<Record<string, SummaryInfo>>({});
    const [conversations, setConversations] = useState<ConversationInfo[]>([]);
    const [activeConversation, setActiveConversation] = useState<ConversationInfo | null>(null);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ── Load projects on mount ─────────────────────────────
    useEffect(() => {
        fetchProjects()
            .then(setProjects)
            .catch(() => { });
        fetchSettings()
            .then((s) => { setSettings(s); setSettingsForm(s); })
            .catch(() => { });
    }, []);

    // ── Load documents when active project changes ─────────
    useEffect(() => {
        if (activeProject) {
            fetchDocuments(activeProject.id)
                .then(setDocuments)
                .catch(() => { });
            // Clear chat when switching projects
            setMessages([]);
        } else {
            setDocuments([]);
            setMessages([]);
            setSummaries({});
            setConversations([]);
            setActiveConversation(null);
        }
    }, [activeProject]);

    // ── Load conversations when project changes ───────────
    useEffect(() => {
        if (activeProject) {
            fetchConversations(activeProject.id)
                .then(setConversations)
                .catch(() => {});
        }
    }, [activeProject]);

    // ── Auto-scroll chat ──────────────────────────────────
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ── Auto-resize textarea ──────────────────────────────
    useEffect(() => {
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = "auto";
            ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
        }
    }, [inputValue]);

    // ── Poll document status until ready ───────────────────
    const pollDocumentStatus = useCallback(async (collectionName: string) => {
        const poll = async () => {
            try {
                const statusData = await fetchDocumentStatus(collectionName);
                if (statusData.status === "ready") {
                    setDocuments((prev: DocumentInfo[]) =>
                        prev.map((d) =>
                            d.collection_name === collectionName
                                ? { ...d, status: "ready", total_pages: statusData.total_pages, total_chunks: statusData.total_chunks }
                                : d
                        )
                    );
                } else if (statusData.status === "error") {
                    setDocuments((prev: DocumentInfo[]) =>
                        prev.map((d) =>
                            d.collection_name === collectionName
                                ? { ...d, status: "error" }
                                : d
                        )
                    );
                    setErrorMsg(`文件處理失敗：${statusData.error_message}`);
                } else {
                    // Still processing, poll again in 3 seconds
                    setTimeout(poll, 3000);
                }
            } catch {
                // Silently retry
                setTimeout(poll, 5000);
            }
        };
        setTimeout(poll, 3000);
    }, []);

    // ── Upload handler ────────────────────────────────────
    const handleUpload = useCallback(async (files: FileList | File[]) => {
        if (!activeProject) return;
        setIsUploading(true);
        setErrorMsg(null);
        for (const file of Array.from(files)) {
            try {
                const doc = await uploadDocument(file, activeProject.id);
                setDocuments((prev: DocumentInfo[]) => [...prev, doc]);
                // Start polling for this document's processing status
                if (doc.status === "processing") {
                    pollDocumentStatus(doc.collection_name);
                }
            } catch (e: any) {
                setErrorMsg(e.message || "上傳失敗");
            }
        }
        setIsUploading(false);
    }, [activeProject, pollDocumentStatus]);

    // ── Delete handler ────────────────────────────────────
    const handleDelete = useCallback(async (collectionName: string) => {
        if (!activeProject) return;
        try {
            await deleteDocument(collectionName, activeProject.id);
            setDocuments((prev) =>
                prev.filter((d) => d.collection_name !== collectionName)
            );
        } catch {
            setErrorMsg("刪除失敗");
        }
    }, [activeProject]);

    // ── Chat handler ──────────────────────────────────────
    const handleSend = useCallback(async () => {
        const query = inputValue.trim();
        if (!query || isStreaming) return;

        setInputValue("");
        setErrorMsg(null);

        const userMsg: ChatMessage = { role: "user", content: query };
        setMessages((prev: ChatMessage[]) => [...prev, userMsg]);

        const assistantMsg: ChatMessage = {
            role: "assistant",
            content: "",
            citations: [],
        };
        setMessages((prev: ChatMessage[]) => [...prev, assistantMsg]);
        setIsStreaming(true);

        try {
            // Auto-create conversation on first message
            let convId = activeConversation?.id;
            if (!convId && activeProject) {
                const conv = await createConversation(activeProject.id, query.slice(0, 50));
                setActiveConversation(conv);
                setConversations((prev: ConversationInfo[]) => [conv, ...prev]);
                convId = conv.id;
            }

            // Build history from existing messages (exclude the just-added user + empty assistant)
            const history = messages.map((m: ChatMessage) => ({ role: m.role, content: m.content }));
            for await (const event of streamChat(query, activeProject?.id, undefined, history, convId)) {
                if (event.type === "citations") {
                    setMessages((prev: ChatMessage[]) => {
                        const msgs = [...prev];
                        msgs[msgs.length - 1] = {
                            ...msgs[msgs.length - 1],
                            citations: event.citations,
                        };
                        return msgs;
                    });
                } else if (event.type === "token" && event.content) {
                    setMessages((prev: ChatMessage[]) => {
                        const msgs = [...prev];
                        msgs[msgs.length - 1] = {
                            ...msgs[msgs.length - 1],
                            content: msgs[msgs.length - 1].content + event.content,
                        };
                        return msgs;
                    });
                }
            }
        } catch (e: any) {
            setMessages((prev: ChatMessage[]) => {
                const msgs = [...prev];
                msgs[msgs.length - 1] = {
                    ...msgs[msgs.length - 1],
                    content: "⚠️ 發生錯誤：" + (e.message || "無法連線到後端服務"),
                };
                return msgs;
            });
        } finally {
            setIsStreaming(false);
        }
    }, [inputValue, isStreaming, activeProject, activeConversation, messages]);

    // ── Conversation switching ─────────────────────────────
    const loadConversation = useCallback(async (conv: ConversationInfo) => {
        setActiveConversation(conv);
        try {
            const msgs = await fetchConversationMessages(conv.id);
            setMessages(msgs);
        } catch {
            setErrorMsg("載入對話失敗");
        }
    }, []);

    const handleNewConversation = useCallback(() => {
        setActiveConversation(null);
        setMessages([]);
    }, []);

    const handleDeleteConversation = useCallback(async (convId: number) => {
        try {
            await deleteConversationApi(convId);
            setConversations((prev: ConversationInfo[]) => prev.filter(c => c.id !== convId));
            if (activeConversation?.id === convId) {
                setActiveConversation(null);
                setMessages([]);
            }
        } catch {
            setErrorMsg("刪除對話失敗");
        }
    }, [activeConversation]);

    // ── Drag & drop ───────────────────────────────────────
    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(e.type === "dragenter" || e.type === "dragover");
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files?.length) handleUpload(e.dataTransfer.files);
    };

    // ── Render ────────────────────────────────────────────

    // ── PROJECT DASHBOARD (no project selected) ──────────
    if (!activeProject) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="w-full max-w-2xl px-6">
                    <div className="text-center mb-10">
                        <BookOpen className="w-12 h-12 text-primary-400 mx-auto mb-4" />
                        <h1 className="text-3xl font-bold text-white mb-2">NotebookLM</h1>
                        <p className="text-[var(--text-secondary)]">選擇或建立一個專案來開始</p>
                    </div>

                    {/* Create new project */}
                    <div className="flex gap-3 mb-8">
                        <input
                            type="text"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && newProjectName.trim()) {
                                    createProject(newProjectName.trim()).then((p) => {
                                        setProjects((prev) => [p, ...prev]);
                                        setNewProjectName("");
                                        setActiveProject(p);
                                    });
                                }
                            }}
                            placeholder="新專案名稱..."
                            className="flex-1 px-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-default)] text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-primary-400 transition-colors"
                        />
                        <button
                            onClick={() => {
                                if (!newProjectName.trim()) return;
                                createProject(newProjectName.trim()).then((p) => {
                                    setProjects((prev) => [p, ...prev]);
                                    setNewProjectName("");
                                    setActiveProject(p);
                                });
                            }}
                            className="px-6 py-3 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-400 transition-colors"
                        >
                            建立
                        </button>
                    </div>

                    {/* Project list */}
                    <div className="space-y-3">
                        {projects.map((p) => (
                            <div
                                key={p.id}
                                className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-default)] hover:border-primary-500/50 cursor-pointer transition-all group"
                                onClick={() => setActiveProject(p)}
                            >
                                <div>
                                    <h3 className="text-white font-medium">{p.name}</h3>
                                    <p className="text-sm text-[var(--text-muted)] mt-1">
                                        {p.document_count} 份文件 · {new Date(p.created_at).toLocaleDateString("zh-TW")}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`確定要刪除「${p.name}」專案及其所有文件嗎？`)) {
                                            deleteProjectApi(p.id).then(() => {
                                                setProjects((prev) => prev.filter((x) => x.id !== p.id));
                                            });
                                        }
                                    }}
                                    className="p-2 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        {projects.length === 0 && (
                            <p className="text-center text-[var(--text-muted)] py-8">
                                尚未建立任何專案，請輸入名稱後按「建立」
                            </p>
                        )}
                    </div>

                    {/* Settings button */}
                    <div className="mt-8 text-center">
                        <button
                            onClick={() => setShowSettings(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            <Settings className="w-4 h-4" /> 設定
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── WORKSPACE VIEW (project selected) ────────────────
    return (
        <div className="flex h-screen overflow-hidden">
            {/* ──────────── LEFT SIDEBAR ──────────── */}
            <aside
                className={`
          flex flex-col border-r border-[var(--border-default)]
          bg-[var(--bg-secondary)] transition-all duration-300
          ${sidebarOpen ? "w-80" : "w-0 overflow-hidden"}
        `}
            >
                {/* Sidebar Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setActiveProject(null)}
                            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors"
                            title="返回專案列表"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <h1 className="text-base font-semibold text-white tracking-tight truncate max-w-[180px]">
                            {activeProject.name}
                        </h1>
                    </div>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                </div>

                {/* Upload Section */}
                <div className="p-4">
                    <div
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`
              flex flex-col items-center gap-2 p-5
              border-2 border-dashed rounded-xl cursor-pointer
              transition-all duration-200
              ${dragActive
                                ? "border-primary-400 bg-primary-500/10"
                                : "border-[var(--border-light)] hover:border-primary-500/50 hover:bg-[var(--bg-hover)]"
                            }
            `}
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
                        onChange={(e) => e.target.files && handleUpload(e.target.files)}
                    />
                </div>

                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-6">
                    {/* Document List */}
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
                                                <p className="text-sm text-[var(--text-primary)] truncate">
                                                    {doc.filename}
                                                </p>
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    {doc.total_pages} 頁 · {doc.total_chunks} 段落
                                                </p>
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(doc.collection_name);
                                                }}
                                                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-all"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </li>
                                    {/* Study Guide expand/collapse */}
                                    <li className="px-3">
                                        <button
                                            onClick={() => {
                                                const key = doc.collection_name;
                                                if (expandedGuide === key) {
                                                    setExpandedGuide(null);
                                                } else {
                                                    setExpandedGuide(key);
                                                    if (!summaries[key]) {
                                                        fetchSummary(key)
                                                            .then((s) => setSummaries((prev) => ({ ...prev, [key]: s })))
                                                            .catch(() => setSummaries((prev) => ({ ...prev, [key]: { collection_name: key, status: "error", summary_text: "", key_points: [], faqs: [], error_message: "載入失敗" } })));
                                                    }
                                                }
                                            }}
                                            className="flex items-center gap-1.5 w-full text-xs text-primary-400 hover:text-primary-300 py-1 transition-colors"
                                        >
                                            <ClipboardList className="w-3 h-3" />
                                            學習指南
                                            {expandedGuide === doc.collection_name ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                                        </button>
                                        {expandedGuide === doc.collection_name && (() => {
                                            const s = summaries[doc.collection_name];
                                            if (!s || s.status === "pending" || s.status === "generating") {
                                                return <div className="mb-2 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs"><div className="flex items-center gap-2 text-[var(--text-muted)]"><Loader2 className="w-3 h-3 animate-spin" /> 正在生成學習指南...</div></div>;
                                            }
                                            if (s.status === "error") {
                                                return <div className="mb-2 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs text-red-400">⚠️ {s.error_message || "生成失敗"}</div>;
                                            }
                                            return (
                                                <div className="mb-2 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-default)] text-xs space-y-2">
                                                    {s.summary_text && (
                                                        <div>
                                                            <p className="font-semibold text-[var(--text-secondary)] mb-1">📝 摘要</p>
                                                            <p className="text-[var(--text-primary)] leading-relaxed">{s.summary_text}</p>
                                                        </div>
                                                    )}
                                                    {s.key_points.length > 0 && (
                                                        <div>
                                                            <p className="font-semibold text-[var(--text-secondary)] mb-1">💡 重點整理</p>
                                                            <ul className="list-disc list-inside space-y-0.5 text-[var(--text-primary)]">
                                                                {s.key_points.map((kp: string, i: number) => <li key={i}>{kp}</li>)}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {s.faqs.length > 0 && (
                                                        <div>
                                                            <p className="font-semibold text-[var(--text-secondary)] mb-1">❓ 常見問題</p>
                                                            <div className="space-y-1.5">
                                                                {s.faqs.map((faq: { q: string; a: string }, i: number) => (
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
                                        })()}
                                    </li>
                                </React.Fragment>
                            ))}
                        </ul>
                    )}
                    </div>

                    {/* Conversation List */}
                    <div>
                        <p className="px-2 py-1 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider flex justify-between items-center">
                            <span>歷史對話 ({conversations.length})</span>
                            <button
                                onClick={handleNewConversation}
                                className="p-1 rounded-md hover:bg-[var(--bg-hover)] text-primary-400 transition-colors"
                                title="新對話"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                        </p>
                        <div className="mt-1 space-y-1">
                            <button
                                onClick={handleNewConversation}
                                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors text-sm ${!activeConversation ? "bg-primary-500/10 text-primary-400" : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"}`}
                            >
                                <MessageSquare className="w-4 h-4 shrink-0" />
                                <span className="truncate">新對話...</span>
                            </button>
                            {conversations.map((conv) => (
                                <div key={conv.id} className="group relative">
                                    <button
                                        onClick={() => loadConversation(conv)}
                                        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors text-sm ${activeConversation?.id === conv.id ? "bg-primary-500/10 text-primary-400" : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"}`}
                                    >
                                        <MessageSquare className="w-4 h-4 shrink-0" />
                                        <span className="truncate flex-1 text-left">{conv.title}</span>
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteConversation(conv.id);
                                        }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 transition-all"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </aside >

            {/* ──────────── MAIN CHAT AREA ──────────── */}
            < main className="flex-1 flex flex-col min-w-0 relative" >
                {/* Top bar */}
                < header className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-default)] bg-[var(--bg-secondary)]/80 backdrop-blur-sm" >
                    {!sidebarOpen && (
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    )
                    }
                    <div className="flex items-center gap-2 flex-1">
                        <Sparkles className="w-4 h-4 text-primary-400" />
                        <span className="text-sm font-medium text-[var(--text-secondary)]">
                            與{" "}
                            <span className="text-primary-400">
                                {documents.length} 份文件
                            </span>{" "}
                            對話中
                            {settings && (
                                <span className="ml-2 text-[var(--text-muted)]">
                                    · {settings.llm_model.split("/").pop()}
                                </span>
                            )}
                        </span>
                    </div>
                    <button
                        onClick={() => {
                            setShowSettings(true);
                            setLoadingModels(true);
                            fetchModels().then(setAvailableModels).catch(() => { }).finally(() => setLoadingModels(false));
                        }}
                        className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-primary-400 transition-colors"
                        title="設定"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                </header >

                {/* Error banner */}
                {
                    errorMsg && (
                        <div className="mx-4 mt-3 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm animate-fade-in">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {errorMsg}
                            <button
                                onClick={() => setErrorMsg(null)}
                                className="ml-auto p-0.5 hover:bg-red-500/20 rounded"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )
                }

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-6">
                    {messages.length === 0 ? (
                        /* Empty state */
                        <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500/20 to-primary-600/10 flex items-center justify-center mb-5">
                                <MessageSquare className="w-8 h-8 text-primary-400" />
                            </div>
                            <h2 className="text-xl font-semibold text-white mb-2">
                                開始與文件對話
                            </h2>
                            <p className="text-[var(--text-secondary)] max-w-md text-sm leading-relaxed">
                                上傳 PDF 文件後，即可針對文件內容提問。
                                <br />
                                AI 會根據文件內容回答，並標註引用來源。
                            </p>
                            <div className="mt-6 flex flex-wrap justify-center gap-2">
                                {[
                                    "這份文件的主要內容是什麼？",
                                    "請幫我總結重點",
                                    "有什麼關鍵發現？",
                                ].map((q) => (
                                    <button
                                        key={q}
                                        onClick={() => {
                                            setInputValue(q);
                                            textareaRef.current?.focus();
                                        }}
                                        className="px-3.5 py-2 text-sm rounded-full border border-[var(--border-light)]
                               text-[var(--text-secondary)] hover:text-primary-300 hover:border-primary-500/40
                               hover:bg-primary-500/5 transition-all duration-200"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* Chat messages */
                        <div className="max-w-3xl mx-auto space-y-5">
                            {messages.map((msg, i) => (
                                <div
                                    key={i}
                                    className={`flex gap-3 animate-slide-up ${msg.role === "user" ? "justify-end" : "justify-start"
                                        }`}
                                >
                                    {msg.role === "assistant" && (
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500/30 to-primary-600/20 flex items-center justify-center shrink-0 mt-0.5">
                                            <Bot className="w-4 h-4 text-primary-300" />
                                        </div>
                                    )}

                                    <div
                                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === "user"
                                            ? "bg-primary-600 text-white"
                                            : "bg-[var(--bg-card)] border border-[var(--border-default)]"
                                            }`}
                                    >
                                        {msg.role === "assistant" ? (
                                            <div className="markdown-content text-sm leading-relaxed text-[var(--text-primary)]">
                                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                                                {/* Streaming indicator */}
                                                {isStreaming && i === messages.length - 1 && !msg.content && (
                                                    <div className="flex gap-1 py-2">
                                                        <span className="typing-dot w-2 h-2 bg-primary-400 rounded-full" />
                                                        <span className="typing-dot w-2 h-2 bg-primary-400 rounded-full" />
                                                        <span className="typing-dot w-2 h-2 bg-primary-400 rounded-full" />
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-sm leading-relaxed">{msg.content}</p>
                                        )}

                                        {/* Citations */}
                                        {msg.citations && msg.citations.length > 0 && (
                                            <div className="mt-3 pt-2 border-t border-[var(--border-default)]">
                                                <p className="text-xs text-[var(--text-muted)] mb-1.5">
                                                    引用來源：
                                                </p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {msg.citations.map((c) => (
                                                        <button
                                                            key={c.index}
                                                            onClick={() => setActiveCitation(c)}
                                                            className="citation-badge"
                                                            title={`${c.source_file} – 第 ${c.page_number} 頁`}
                                                        >
                                                            {c.index}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {msg.role === "user" && (
                                        <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center shrink-0 mt-0.5">
                                            <User className="w-4 h-4 text-dark-300" />
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>
                    )}
                </div>

                {/* Input area */}
                <div className="border-t border-[var(--border-default)] bg-[var(--bg-secondary)]/80 backdrop-blur-sm px-4 py-3">
                    <div className="max-w-3xl mx-auto">
                        <div className="flex items-end gap-2 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl px-4 py-2 focus-within:border-primary-500/50 transition-colors">
                            <textarea
                                ref={textareaRef}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder="輸入問題，與文件對話..."
                                rows={1}
                                className="flex-1 bg-transparent border-none outline-none resize-none
                           text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                           max-h-40 py-1"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!inputValue.trim() || isStreaming}
                                className="p-2 rounded-xl bg-primary-600 text-white
                           hover:bg-primary-500 disabled:opacity-30 disabled:cursor-not-allowed
                           transition-all duration-200 shrink-0"
                            >
                                {isStreaming ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                        <p className="mt-1.5 text-center text-xs text-[var(--text-muted)]">
                            AI 的回答僅基於已上傳的文件內容，並附帶引用來源。
                        </p>
                    </div>
                </div>
            </main >

            {/* ──────────── CITATION PANEL (Overlay) ──────────── */}
            {
                activeCitation && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col animate-slide-up">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
                                <div>
                                    <h3 className="text-sm font-semibold text-white">來源 {activeCitation.index}</h3>
                                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{activeCitation.source_file} · 第 {activeCitation.page_number} 頁</p>
                                </div>
                                <button onClick={() => setActiveCitation(null)} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto px-5 py-4">
                                <div className="bg-[var(--citation-bg)] border border-[var(--citation-border)] rounded-xl p-4">
                                    <p className="text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">{activeCitation.text}</p>
                                </div>
                                <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-muted)]">
                                    <span>相關度分數：{activeCitation.score}</span>
                                    <span>段落 #{activeCitation.chunk_index}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* ──────────── SETTINGS MODAL ──────────── */}
            {
                showSettings && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[85vh] flex flex-col animate-slide-up">
                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
                                <div className="flex items-center gap-2">
                                    <Settings className="w-4 h-4 text-primary-400" />
                                    <h3 className="text-sm font-semibold text-white">模型設定</h3>
                                </div>
                                <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-colors"><X className="w-4 h-4" /></button>
                            </div>

                            {/* Form */}
                            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                                {/* API Base URL */}
                                <div>
                                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">API Base URL</label>
                                    <input
                                        type="text"
                                        value={settingsForm.llm_api_base_url || ""}
                                        onChange={(e) => setSettingsForm({ ...settingsForm, llm_api_base_url: e.target.value })}
                                        className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:border-primary-500/50 outline-none transition-colors"
                                        placeholder="https://172.16.120.35/v1"
                                    />
                                </div>

                                {/* API Key */}
                                <div>
                                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">API Key</label>
                                    <input
                                        type="password"
                                        value={settingsForm.llm_api_key || ""}
                                        onChange={(e) => setSettingsForm({ ...settingsForm, llm_api_key: e.target.value })}
                                        className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:border-primary-500/50 outline-none transition-colors"
                                        placeholder="sk-..."
                                    />
                                </div>

                                {/* Chat Model */}
                                <div>
                                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">對話模型</label>
                                    {loadingModels ? (
                                        <div className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-muted)]">
                                            <Loader2 className="w-4 h-4 animate-spin" /> 載入模型列表中...
                                        </div>
                                    ) : (
                                        <select
                                            value={settingsForm.llm_model || ""}
                                            onChange={(e) => setSettingsForm({ ...settingsForm, llm_model: e.target.value })}
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

                                {/* Embedding Model */}
                                <div>
                                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">嵌入模型 (Embedding)</label>
                                    <select
                                        value={settingsForm.embedding_model || ""}
                                        onChange={(e) => setSettingsForm({ ...settingsForm, embedding_model: e.target.value })}
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

                                {/* Temperature */}
                                <div>
                                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                                        Temperature: {settingsForm.temperature?.toFixed(2) ?? "0.10"}
                                    </label>
                                    <input
                                        type="range"
                                        min="0" max="1" step="0.05"
                                        value={settingsForm.temperature ?? 0.1}
                                        onChange={(e) => setSettingsForm({ ...settingsForm, temperature: parseFloat(e.target.value) })}
                                        className="w-full accent-primary-500"
                                    />
                                    <div className="flex justify-between text-xs text-[var(--text-muted)] mt-0.5">
                                        <span>精確</span><span>有創意</span>
                                    </div>
                                </div>

                                {/* Top-K */}
                                <div>
                                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">檢索數量 (Top-K)</label>
                                    <input
                                        type="number"
                                        min="1" max="20"
                                        value={settingsForm.top_k ?? 5}
                                        onChange={(e) => setSettingsForm({ ...settingsForm, top_k: parseInt(e.target.value) || 5 })}
                                        className="w-20 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:border-primary-500/50 outline-none transition-colors"
                                    />
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-default)]">
                                <button
                                    onClick={() => { setSettingsForm(settings || {}); setShowSettings(false); }}
                                    className="px-4 py-2 text-sm rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={async () => {
                                        setSavingSettings(true);
                                        try {
                                            const updated = await updateSettings(settingsForm);
                                            setSettings(updated);
                                            setSettingsForm(updated);
                                            setShowSettings(false);
                                        } catch { setErrorMsg("儲存設定失敗"); }
                                        finally { setSavingSettings(false); }
                                    }}
                                    disabled={savingSettings}
                                    className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-500 disabled:opacity-50 transition-colors"
                                >
                                    {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    儲存
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
