"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2 } from "lucide-react";
import { apiLogin, apiRegister } from "@/lib/api";
import { saveToken } from "@/lib/auth";

type Tab = "login" | "register";

export default function LoginPage() {
    const router = useRouter();
    const [tab, setTab] = useState<Tab>("login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const fn = tab === "login" ? apiLogin : apiRegister;
            const { token } = await fn(username, password);
            saveToken(token);
            router.push("/");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "發生錯誤，請稍後再試");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center h-screen">
            <div className="w-full max-w-md px-6">
                <div className="text-center mb-8">
                    <BookOpen className="w-12 h-12 text-primary-400 mx-auto mb-4" />
                    <h1 className="text-3xl font-bold text-white mb-2">NotebookLM</h1>
                    <p className="text-[var(--text-secondary)]">基於文件的 AI 對話系統</p>
                </div>

                <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-2xl p-6">
                    {/* Tabs */}
                    <div className="flex mb-6 bg-[var(--bg-primary)] rounded-xl p-1" role="tablist">
                        {(["login", "register"] as Tab[]).map((t) => (
                            <button
                                key={t}
                                role="tab"
                                aria-selected={tab === t}
                                onClick={() => { setTab(t); setError(null); }}
                                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    tab === t
                                        ? "bg-primary-600 text-white"
                                        : "text-[var(--text-muted)] hover:text-white"
                                }`}
                            >
                                {t === "login" ? "登入" : "註冊"}
                            </button>
                        ))}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                                使用者名稱
                            </label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                minLength={3}
                                maxLength={50}
                                autoComplete="username"
                                className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-primary-400 transition-colors"
                                placeholder="3-50 個字元"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                                密碼
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
                                autoComplete={tab === "login" ? "current-password" : "new-password"}
                                className="w-full px-4 py-2.5 bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-xl text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-primary-400 transition-colors"
                                placeholder="至少 8 個字元"
                            />
                        </div>

                        {error && (
                            <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2.5 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {tab === "login" ? "登入" : "建立帳號"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
