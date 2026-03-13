import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "NotebookLM – 本地文件智慧助手",
    description: "上傳文件，與 AI 對話，精準引用來源。完全在地運行，資料不外洩。",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="zh-TW" className="dark">
            <body className="min-h-screen bg-[var(--bg-primary)]">
                {children}
            </body>
        </html>
    );
}
