"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";
import { MindMapContent, MindMapNode } from "@/lib/api";

interface Props {
    data: MindMapContent;
    onAskQuestion?: (question: string) => void;
}

// ── Constants ─────────────────────────────────────────────────

const COL_WIDTH  = 240;   // horizontal gap between level centers
const ROW_HEIGHT = 46;    // min vertical space per leaf
const LEFT_PAD   = 32;    // left margin
const BOX_H      = 30;

const NODE_COLORS = [
    "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
    "#ef4444", "#06b6d4", "#f97316", "#84cc16",
];

function nodeBoxW(label: string): number {
    return Math.max(72, Math.min(label.length * 8.2 + 22, 160));
}

// ── Tree analysis ─────────────────────────────────────────────

function countVisibleLeaves(node: MindMapNode, collapsed: Set<string>, path: string): number {
    if (!node.children?.length || collapsed.has(path)) return 1;
    return node.children.reduce(
        (s, c, i) => s + countVisibleLeaves(c, collapsed, `${path}/${i}`),
        0,
    );
}

function getMaxDepth(node: MindMapNode, d = 0): number {
    if (!node.children?.length) return d;
    return Math.max(...node.children.map((c) => getMaxDepth(c, d + 1)));
}

// ── Layout ────────────────────────────────────────────────────

interface LayoutNode {
    label: string;
    path: string;
    x: number;       // box center
    y: number;       // box center
    level: number;
    colorIdx: number;
    hasChildren: boolean;
    isLeaf: boolean;      // truly no children in data
    isCollapsed: boolean;
    children: LayoutNode[];
}

function layoutTree(
    node: MindMapNode,
    cx: number,          // center x of this node
    yTop: number,        // allocated vertical range top
    yBot: number,        // allocated vertical range bottom
    level: number,
    collapsed: Set<string>,
    path: string,
    colorIdx: number,
): LayoutNode {
    const y = (yTop + yBot) / 2;
    const raw = node.children ?? [];
    const isCollapsed = collapsed.has(path);
    const visible = isCollapsed ? [] : raw;

    let children: LayoutNode[] = [];
    if (visible.length > 0) {
        const totalLeaves = visible.reduce(
            (s, c, i) => s + countVisibleLeaves(c, collapsed, `${path}/${i}`),
            0,
        );
        let curY = yTop;
        children = visible.map((child, i) => {
            const cl = countVisibleLeaves(child, collapsed, `${path}/${i}`);
            const span = (yBot - yTop) * (cl / totalLeaves);
            const ci = level === 0 ? i : colorIdx;
            const result = layoutTree(
                child, cx + COL_WIDTH, curY, curY + span,
                level + 1, collapsed, `${path}/${i}`, ci,
            );
            curY += span;
            return result;
        });
    }

    return {
        label: node.label, path, x: cx, y, level, colorIdx,
        hasChildren: raw.length > 0,
        isLeaf: raw.length === 0,
        isCollapsed, children,
    };
}

// ── SVG element builder ───────────────────────────────────────

function buildElements(
    node: LayoutNode,
    parent: LayoutNode | null,
    onToggle: (path: string) => void,
    onAsk: ((q: string) => void) | undefined,
): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    const w = nodeBoxW(node.label);

    // Bezier connector from parent right → this node left
    if (parent) {
        const pw = nodeBoxW(parent.label);
        const x1 = parent.x + pw / 2;
        const y1 = parent.y;
        const x2 = node.x - w / 2;
        const y2 = node.y;
        const mx = (x1 + x2) / 2;
        out.push(
            <path
                key={`e-${node.path}`}
                d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                fill="none" stroke="#94a3b8" strokeWidth="1.5"
            />,
        );
    }

    const isRoot = node.level === 0;
    const color = isRoot ? "#1e3a8a" : NODE_COLORS[node.colorIdx % NODE_COLORS.length];
    const fs = isRoot ? 13 : 11;
    const rx = isRoot ? 8 : 6;
    const displayLabel = node.label.length > 15
        ? node.label.slice(0, 15) + "…"
        : node.label;

    // Click: toggle if has children; ask if leaf
    const clickable = node.hasChildren || (node.isLeaf && !!onAsk);
    const handleClick = node.hasChildren
        ? () => onToggle(node.path)
        : node.isLeaf && onAsk
        ? () => onAsk(node.label)
        : undefined;

    out.push(
        <g
            key={`n-${node.path}`}
            onClick={handleClick ? (e) => { e.stopPropagation(); handleClick(); } : undefined}
            style={{ cursor: clickable ? "pointer" : "default" }}
        >
            {/* Drop shadow */}
            <rect
                x={node.x - w / 2 + 1} y={node.y - BOX_H / 2 + 2}
                width={w} height={BOX_H} rx={rx}
                fill="rgba(0,0,0,0.12)"
            />
            {/* Box */}
            <rect
                x={node.x - w / 2} y={node.y - BOX_H / 2}
                width={w} height={BOX_H} rx={rx}
                fill={color}
            />
            {/* Dashed border for askable leaf */}
            {node.isLeaf && !!onAsk && (
                <rect
                    x={node.x - w / 2} y={node.y - BOX_H / 2}
                    width={w} height={BOX_H} rx={rx}
                    fill="none"
                    stroke="rgba(255,255,255,0.45)"
                    strokeWidth="1.5"
                    strokeDasharray="4,3"
                />
            )}
            {/* Label */}
            <text
                x={node.hasChildren && !isRoot ? node.x - 9 : node.x}
                y={node.y + fs * 0.38}
                textAnchor="middle"
                fontSize={fs}
                fill="white"
                fontWeight={isRoot ? "bold" : "normal"}
                style={{ pointerEvents: "none" }}
            >
                {displayLabel}
            </text>
            {/* Expand / collapse chevron */}
            {node.hasChildren && !isRoot && (
                <text
                    x={node.x + w / 2 - 9}
                    y={node.y + 4}
                    textAnchor="middle"
                    fontSize={12}
                    fill="rgba(255,255,255,0.85)"
                    style={{ pointerEvents: "none" }}
                >
                    {node.isCollapsed ? "›" : "‹"}
                </text>
            )}
        </g>,
    );

    for (const child of node.children) {
        out.push(...buildElements(child, node, onToggle, onAsk));
    }
    return out;
}

// ── Canvas ────────────────────────────────────────────────────

interface CanvasProps {
    data: MindMapContent;
    collapsed: Set<string>;
    onToggle: (path: string) => void;
    onAskQuestion?: (q: string) => void;
    className?: string;
}

function MindMapCanvas({ data, collapsed, onToggle, onAskQuestion, className = "" }: CanvasProps) {
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const dragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // SVG size based on fully-expanded tree (pan/zoom handles overflow)
    const totalLeaves = useMemo(
        () => countVisibleLeaves(data.root, new Set(), "root"),
        [data.root],
    );
    const maxDepth = useMemo(() => getMaxDepth(data.root), [data.root]);
    const svgH = Math.max(400, totalLeaves * ROW_HEIGHT + 80);
    const svgW = Math.max(500, (maxDepth + 2) * COL_WIDTH + LEFT_PAD + 40);

    const rootX = LEFT_PAD + nodeBoxW(data.root.label) / 2;
    const layout = layoutTree(data.root, rootX, 40, svgH - 40, 0, collapsed, "root", 0);
    const elements = buildElements(layout, null, onToggle, onAskQuestion);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        dragging.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
    }, []);
    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!dragging.current) return;
        setOffset((o) => ({
            x: o.x + e.clientX - lastPos.current.x,
            y: o.y + e.clientY - lastPos.current.y,
        }));
        lastPos.current = { x: e.clientX, y: e.clientY };
    }, []);
    const onMouseUp = useCallback(() => { dragging.current = false; }, []);

    // Non-passive wheel for zoom
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            e.preventDefault();
            setScale((s) => Math.min(3, Math.max(0.25, s - e.deltaY * 0.001)));
        };
        el.addEventListener("wheel", handler, { passive: false });
        return () => el.removeEventListener("wheel", handler);
    }, []);

    return (
        <div
            ref={containerRef}
            className={`overflow-hidden bg-slate-50 cursor-grab active:cursor-grabbing ${className}`}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
        >
            <svg
                width="100%" height="100%"
                viewBox={`0 0 ${svgW} ${svgH}`}
                style={{ userSelect: "none" }}
            >
                <g transform={`translate(${offset.x},${offset.y}) scale(${scale})`}>
                    {elements}
                </g>
            </svg>
        </div>
    );
}

// ── Main ──────────────────────────────────────────────────────

export function MindMapViewer({ data, onAskQuestion }: Props) {
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [fullscreen, setFullscreen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!fullscreen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [fullscreen]);

    const onToggle = useCallback((path: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path); else next.add(path);
            return next;
        });
    }, []);

    const hint = onAskQuestion
        ? "拖曳移動・滾輪縮放・點節點展開\/收合・點末端節點詢問"
        : "拖曳移動・滾輪縮放・點節點展開\/收合";

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">{hint}</p>
                <button
                    onClick={() => setFullscreen(true)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                    title="全螢幕展開"
                >
                    <Maximize2 className="w-4 h-4 text-gray-500" />
                </button>
            </div>

            <MindMapCanvas
                data={data}
                collapsed={collapsed}
                onToggle={onToggle}
                onAskQuestion={onAskQuestion}
                className="rounded-xl border border-gray-200 h-[380px]"
            />

            {mounted && fullscreen && createPortal(
                <div
                    className="fixed inset-0 z-50 flex flex-col bg-white"
                    role="dialog"
                    aria-modal="true"
                    aria-label="心智圖全螢幕"
                >
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0">
                        <span className="font-semibold text-gray-800">心智圖</span>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400">{hint}</span>
                            <button
                                onClick={() => setFullscreen(false)}
                                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                                aria-label="關閉全螢幕"
                            >
                                <X className="w-5 h-5 text-gray-600" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0 p-1">
                        <MindMapCanvas
                            data={data}
                            collapsed={collapsed}
                            onToggle={onToggle}
                            onAskQuestion={onAskQuestion
                                ? (q) => { setFullscreen(false); onAskQuestion(q); }
                                : undefined
                            }
                            className="w-full h-full"
                        />
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}
