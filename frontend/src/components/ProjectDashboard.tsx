"use client";

import React, { useState } from "react";
import { BookOpen, Trash2, Settings, LogOut } from "lucide-react";
import { ProjectInfo, createProject, deleteProjectApi } from "@/lib/api";
import { removeToken } from "@/lib/auth";

interface ProjectDashboardProps {
    projects: ProjectInfo[];
    onSelectProject: (p: ProjectInfo) => void;
    onProjectCreated: (p: ProjectInfo) => void;
    onProjectDeleted: (id: number) => void;
    onOpenSettings: () => void;
    onLogout: () => void;
}

export function ProjectDashboard({
    projects,
    onSelectProject,
    onProjectCreated,
    onProjectDeleted,
    onOpenSettings,
    onLogout,
}: ProjectDashboardProps) {
    const [newProjectName, setNewProjectName] = useState("");

    const handleCreate = async () => {
        if (!newProjectName.trim()) return;
        const p = await createProject(newProjectName.trim());
        onProjectCreated(p);
        setNewProjectName("");
        onSelectProject(p);
    };

    const handleDelete = async (e: React.MouseEvent, p: ProjectInfo) => {
        e.stopPropagation();
        if (!confirm(`確定要刪除「${p.name}」專案及其所有文件嗎？`)) return;
        await deleteProjectApi(p.id);
        onProjectDeleted(p.id);
    };

    const handleLogout = () => {
        removeToken();
        onLogout();
    };

    return (
        <div className="flex items-center justify-center h-screen">
            <div className="w-full max-w-2xl px-6">
                <div className="text-center mb-10">
                    <BookOpen className="w-12 h-12 text-primary-400 mx-auto mb-4" />
                    <h1 className="text-3xl font-bold text-white mb-2">NotebookLM</h1>
                    <p className="text-[var(--text-secondary)]">選擇或建立一個專案來開始</p>
                </div>

                {/* Create */}
                <div className="flex gap-3 mb-8">
                    <input
                        type="text"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                        placeholder="新專案名稱..."
                        aria-label="新專案名稱"
                        className="flex-1 px-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-default)] text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-primary-400 transition-colors"
                    />
                    <button
                        onClick={handleCreate}
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
                            onClick={() => onSelectProject(p)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === "Enter" && onSelectProject(p)}
                            aria-label={`開啟專案 ${p.name}`}
                        >
                            <div>
                                <h3 className="text-white font-medium">{p.name}</h3>
                                <p className="text-sm text-[var(--text-muted)] mt-1">
                                    {p.document_count} 份文件 · {new Date(p.created_at).toLocaleDateString("zh-TW")}
                                </p>
                            </div>
                            <button
                                onClick={(e) => handleDelete(e, p)}
                                aria-label={`刪除專案 ${p.name}`}
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

                {/* Footer actions */}
                <div className="mt-8 flex justify-center gap-4">
                    <button
                        onClick={onOpenSettings}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors"
                    >
                        <Settings className="w-4 h-4" /> 設定
                    </button>
                    <button
                        onClick={handleLogout}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] transition-colors"
                    >
                        <LogOut className="w-4 h-4" /> 登出
                    </button>
                </div>
            </div>
        </div>
    );
}
