"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MindMapContent, MindMapNode } from "@/lib/api";

interface Props {
    data: MindMapContent;
}

interface LayoutNode {
    label: string;
    x: number;
    y: number;
    level: number;
    children: LayoutNode[];
}

const LEVEL_RADIUS = [0, 160, 300];
const NODE_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"];

function layoutTree(node: MindMapNode, cx: number, cy: number, angle: number, spread: number, level: number): LayoutNode {
    const r = LEVEL_RADIUS[level] ?? 300;
    const x = level === 0 ? cx : cx + r * Math.cos(angle);
    const y = level === 0 ? cy : cy + r * Math.sin(angle);

    const children = (node.children ?? []).map((child, i) => {
        const count = node.children!.length;
        const childAngle = level === 0
            ? (i / count) * 2 * Math.PI
            : angle - spread / 2 + (i / Math.max(count - 1, 1)) * spread;
        const childSpread = Math.PI / 3;
        return layoutTree(child, x, y, childAngle, childSpread, level + 1);
    });

    return { label: node.label, x, y, level, children };
}

function renderNode(node: LayoutNode, parent: LayoutNode | null, colorIndex: number): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];

    if (parent) {
        nodes.push(
            <line
                key={`line-${node.label}-${node.x}`}
                x1={parent.x}
                y1={parent.y}
                x2={node.x}
                y2={node.y}
                stroke="#d1d5db"
                strokeWidth="1.5"
            />,
        );
    }

    const color = node.level === 0 ? "#1e40af" : NODE_COLORS[(colorIndex) % NODE_COLORS.length];
    const textLen = node.label.length;
    const boxW = Math.max(52, Math.min(textLen * 9 + 12, 100));
    const boxH = node.level === 0 ? 32 : 24;
    const fontSize = node.level === 0 ? 12 : 10;

    nodes.push(
        <g key={`node-${node.label}-${node.x}`}>
            <rect
                x={node.x - boxW / 2}
                y={node.y - boxH / 2}
                width={boxW}
                height={boxH}
                rx={node.level === 0 ? 8 : 5}
                fill={color}
                opacity={node.level === 0 ? 1 : 0.85}
            />
            <text
                x={node.x}
                y={node.y + fontSize * 0.35}
                textAnchor="middle"
                fontSize={fontSize}
                fill="white"
                fontWeight={node.level === 0 ? "bold" : "normal"}
            >
                {node.label.length > 10 ? node.label.slice(0, 10) + "…" : node.label}
            </text>
        </g>,
    );

    node.children.forEach((child, i) => {
        const childColor = node.level === 0 ? i : colorIndex;
        nodes.push(...renderNode(child, node, childColor));
    });

    return nodes;
}

export function MindMapViewer({ data }: Props) {
    const SVG_W = 700;
    const SVG_H = 600;
    const cx = SVG_W / 2;
    const cy = SVG_H / 2;

    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const dragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const layout = layoutTree(data.root, cx, cy, 0, Math.PI * 2, 0);
    const elements = renderNode(layout, null, 0);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        dragging.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
    }, []);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!dragging.current) return;
        const dx = e.clientX - lastPos.current.x;
        const dy = e.clientY - lastPos.current.y;
        lastPos.current = { x: e.clientX, y: e.clientY };
        setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
    }, []);

    const onMouseUp = useCallback(() => { dragging.current = false; }, []);

    // Use native listener with { passive: false } so preventDefault works
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            e.preventDefault();
            setScale((s) => Math.min(2, Math.max(0.4, s - e.deltaY * 0.001)));
        };
        el.addEventListener("wheel", handler, { passive: false });
        return () => el.removeEventListener("wheel", handler);
    }, []);

    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-400 text-center">拖曳移動・滾輪縮放</p>
            <div
                ref={containerRef}
                className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50 cursor-grab active:cursor-grabbing"
                style={{ height: 380 }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
            >
                <svg
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${SVG_W} ${SVG_H}`}
                    style={{ userSelect: "none" }}
                >
                    <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale}) translate(${(1 - 1) * SVG_W / 2}, ${(1 - 1) * SVG_H / 2})`}>
                        {elements}
                    </g>
                </svg>
            </div>
        </div>
    );
}
