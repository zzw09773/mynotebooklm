"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { SlidesContent, SlideItem, SlideCard as SlideCardData } from "@/lib/api";

interface Props {
    data: SlidesContent;
    artifactId?: number;
}

// ── Theme system (from theme-factory) ────────────────────────

interface ThemeColors {
    bg: string; accent: string; title: string;
    text: string; muted: string; cardBg: string;
}

const SLIDE_THEMES: Record<string, ThemeColors> = {
    "tech-innovation":   { bg:"1E1E1E", accent:"0066FF", title:"FFFFFF", text:"CCCCCC", muted:"888888", cardBg:"2A2A2A" },
    "midnight-galaxy":   { bg:"2B1E3E", accent:"A490C2", title:"E6E6FA", text:"C8B8E0", muted:"6B5B8A", cardBg:"3A2D50" },
    "ocean-depths":      { bg:"1A2332", accent:"2D8B8B", title:"F1FAEE", text:"A8DADC", muted:"5A8A8A", cardBg:"243040" },
    "modern-minimalist": { bg:"FFFFFF", accent:"708090", title:"36454F", text:"36454F", muted:"A0A0A0", cardBg:"F0F0F0" },
    "sunset-boulevard":  { bg:"264653", accent:"E76F51", title:"E9C46A", text:"F4A261", muted:"A09060", cardBg:"314D5E" },
    "forest-canopy":     { bg:"2D4A2B", accent:"A4AC86", title:"FAF9F6", text:"C8CCB8", muted:"7D8471", cardBg:"3A5C38" },
    "golden-hour":       { bg:"4A403A", accent:"F4A900", title:"D4B896", text:"D4B896", muted:"C1666B", cardBg:"5A4E47" },
    "arctic-frost":      { bg:"FAFAFA", accent:"4A6FA5", title:"1A2332", text:"334155", muted:"909090", cardBg:"D4E4F7" },
    "desert-rose":       { bg:"E8D5C4", accent:"B87D6D", title:"5D2E46", text:"5D2E46", muted:"D4A5A5", cardBg:"F0E4D8" },
    "botanical-garden":  { bg:"F5F3ED", accent:"4A7C59", title:"333333", text:"555555", muted:"B7472A", cardBg:"EBE9E1" },
};

// Shadow factory — MUST return a new object each call; pptxgenjs mutates options in-place
const makeShadow = () => ({ type: "outer" as const, color: "000000", blur: 6, offset: 2, angle: 135, opacity: 0.12 });

// ── Slide layout builders (LAYOUT_16x9: 10" × 5.625") ─────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addCount(sld: any, index: number, total: number, muted: string) {
    sld.addText(`${index + 1} / ${total}`, {
        x: 8.7, y: 5.2, w: 1.1, h: 0.3,
        fontSize: 9, color: muted, align: "right", margin: 0,
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCoverSlide(prs: any, sld: any, s: SlideItem, t: ThemeColors, total: number, i: number) {
    sld.background = { color: t.bg };
    sld.addShape(prs.shapes.RECTANGLE, { x: 0.35, y: 1.3, w: 0.07, h: 3.0, fill: { color: t.accent }, line: { color: t.accent } });
    [[0.38, 9.05, 4.45], [0.24, 9.28, 4.68], [0.12, 9.45, 4.85]].forEach(([size, px, py]) => {
        sld.addShape(prs.shapes.RECTANGLE, { x: px, y: py, w: size, h: size, fill: { color: t.accent }, line: { color: t.accent } });
    });
    sld.addText(s.title, { x: 0.7, y: 1.6, w: 7.9, h: 1.4, fontSize: 36, bold: true, color: t.title, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    if (s.subtitle) {
        sld.addText(s.subtitle, { x: 0.7, y: 3.2, w: 7.9, h: 0.65, fontSize: 18, color: t.muted, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    }
    addCount(sld, i, total, t.muted);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildContentSlide(prs: any, sld: any, s: SlideItem, t: ThemeColors, total: number, i: number) {
    sld.background = { color: t.bg };
    sld.addShape(prs.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.09, fill: { color: t.accent }, line: { color: t.accent } });
    sld.addText(s.title, { x: 0.5, y: 0.15, w: 9, h: 0.65, fontSize: 22, bold: true, color: t.title, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    const bulletY = s.subtitle ? 1.08 : 0.92;
    if (s.subtitle) {
        sld.addText(s.subtitle, { x: 0.5, y: 0.85, w: 9, h: 0.35, fontSize: 12, color: t.muted, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    }
    const items = s.bullets.map((b, idx) => ({
        text: b,
        options: { bullet: true, paraSpaceAfter: 8, fontSize: 13, color: t.text, breakLine: idx < s.bullets.length - 1 },
    }));
    sld.addText(items, { x: 0.5, y: bulletY, w: 9, h: 5.625 - bulletY - 0.45, fontFace: "Microsoft JhengHei", shrinkText: true });
    addCount(sld, i, total, t.muted);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStatsSlide(prs: any, sld: any, s: SlideItem, t: ThemeColors, total: number, i: number) {
    sld.background = { color: t.bg };
    sld.addShape(prs.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.09, fill: { color: t.accent }, line: { color: t.accent } });
    sld.addText(s.title, { x: 0.5, y: 0.15, w: 9, h: 0.65, fontSize: 22, bold: true, color: t.title, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    const cols = [0.35, 5.2];
    const rows = [1.05, 3.1];
    s.bullets.slice(0, 4).forEach((bullet, ci) => {
        const cx = cols[ci % 2], cy = rows[Math.floor(ci / 2)];
        sld.addShape(prs.shapes.RECTANGLE, { x: cx, y: cy, w: 4.5, h: 1.7, fill: { color: t.cardBg }, line: { color: t.cardBg }, shadow: makeShadow() });
        sld.addShape(prs.shapes.RECTANGLE, { x: cx, y: cy, w: 4.5, h: 0.05, fill: { color: t.accent }, line: { color: t.accent } });
        const colonIdx = bullet.search(/[：:]/);
        const splitAt = colonIdx > 0 && colonIdx <= 8 ? colonIdx : -1;
        const bigText = splitAt > 0 ? bullet.slice(0, splitAt) : bullet.slice(0, 5);
        const smallText = splitAt > 0 ? bullet.slice(splitAt + 1).trim() : bullet.slice(5);
        sld.addText(bigText, { x: cx + 0.2, y: cy + 0.12, w: 4.1, h: 0.65, fontSize: 24, bold: true, color: t.accent, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
        if (smallText) {
            sld.addText(smallText, { x: cx + 0.2, y: cy + 0.82, w: 4.1, h: 0.75, fontSize: 12, color: t.text, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
        }
    });
    addCount(sld, i, total, t.muted);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildQuoteSlide(prs: any, sld: any, s: SlideItem, t: ThemeColors, total: number, i: number) {
    sld.background = { color: t.bg };
    sld.addText("\u201C", { x: 0.3, y: 0.1, w: 1.5, h: 1.5, fontSize: 80, bold: true, color: t.accent, fontFace: "Georgia", margin: 0 });
    const quote = s.bullets[0] || s.title;
    sld.addText(quote, { x: 1.0, y: 1.1, w: 7.9, h: 2.6, fontSize: 22, italic: true, color: t.title, align: "center", fontFace: "Microsoft JhengHei", valign: "middle", shrinkText: true });
    if (s.subtitle) {
        sld.addText(`\u2014 ${s.subtitle}`, { x: 1.0, y: 4.3, w: 8.7, h: 0.5, fontSize: 13, color: t.muted, align: "right", fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    }
    addCount(sld, i, total, t.muted);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSectionSlide(prs: any, sld: any, s: SlideItem, t: ThemeColors, total: number, i: number) {
    sld.background = { color: t.bg };
    sld.addShape(prs.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 2.55, fill: { color: t.accent }, line: { color: t.accent } });
    sld.addText(`SECTION ${String(i + 1).padStart(2, "0")}`, {
        x: 0.6, y: 0.45, w: 8.5, h: 0.45, fontSize: 11, charSpacing: 4,
        color: "FFFFFF", fontFace: "Microsoft JhengHei", margin: 0,
    });
    sld.addText(s.title, { x: 0.6, y: 1.0, w: 8.5, h: 1.3, fontSize: 30, bold: true, color: "FFFFFF", fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    if (s.subtitle) {
        sld.addText(s.subtitle, { x: 0.6, y: 2.9, w: 8.5, h: 0.85, fontSize: 16, color: t.text, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    }
    addCount(sld, i, total, t.muted);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildConclusionSlide(prs: any, sld: any, s: SlideItem, t: ThemeColors, total: number, i: number) {
    sld.background = { color: t.bg };
    sld.addShape(prs.shapes.RECTANGLE, { x: 0.35, y: 1.0, w: 0.07, h: 1.5, fill: { color: t.accent }, line: { color: t.accent } });
    sld.addText(s.title, { x: 0.7, y: 1.05, w: 8.5, h: 1.1, fontSize: 30, bold: true, color: t.title, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    if (s.subtitle) {
        sld.addText(s.subtitle, { x: 0.7, y: 2.25, w: 8.5, h: 0.55, fontSize: 15, color: t.muted, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    }
    const chipY = s.subtitle ? 3.15 : 2.9;
    const chipW = 4.2, chipH = 0.55;
    s.bullets.slice(0, 4).forEach((bullet, ci) => {
        const cx = 0.5 + (ci % 2) * (chipW + 0.2);
        const cy = chipY + Math.floor(ci / 2) * (chipH + 0.15);
        sld.addShape(prs.shapes.RECTANGLE, { x: cx, y: cy, w: chipW, h: chipH, fill: { color: t.cardBg }, line: { color: t.cardBg } });
        sld.addShape(prs.shapes.RECTANGLE, { x: cx, y: cy, w: 0.05, h: chipH, fill: { color: t.accent }, line: { color: t.accent } });
        const colonIdx = bullet.search(/[：:]/);
        const chipText = colonIdx > 0 ? bullet.slice(0, colonIdx) : bullet.slice(0, 20);
        sld.addText(chipText, { x: cx + 0.15, y: cy + 0.08, w: chipW - 0.25, h: chipH - 0.1, fontSize: 12, color: t.text, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    });
    addCount(sld, i, total, t.muted);
}

// ── New layout PPTX builders ───────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildBigNumberSlide(prs: any, sld: any, s: SlideItem, t: ThemeColors, total: number, i: number) {
    sld.background = { color: t.bg };
    sld.addShape(prs.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.09, fill: { color: t.accent }, line: { color: t.accent } });
    sld.addText(s.title, { x: 0.5, y: 0.2, w: 9, h: 0.6, fontSize: 20, bold: true, color: t.title, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    // Large metric number centred
    const metricStr = (s.metric ?? "—") + (s.unit ? " " + s.unit : "");
    sld.addText(metricStr, { x: 1.5, y: 1.1, w: 7, h: 2.4, fontSize: 72, bold: true, color: t.accent, align: "center", fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    // Divider line
    sld.addShape(prs.shapes.RECTANGLE, { x: 3.5, y: 3.6, w: 3.0, h: 0.04, fill: { color: t.muted }, line: { color: t.muted } });
    // Label below
    if (s.label) {
        sld.addText(s.label, { x: 1.5, y: 3.75, w: 7, h: 0.65, fontSize: 18, color: t.text, align: "center", fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    }
    // Optional supporting bullets at bottom
    if (s.bullets.length > 0) {
        sld.addText(s.bullets[0], { x: 1.5, y: 4.55, w: 7, h: 0.65, fontSize: 12, color: t.muted, align: "center", fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    }
    addCount(sld, i, total, t.muted);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDualCardSlide(prs: any, sld: any, s: SlideItem, t: ThemeColors, total: number, i: number) {
    sld.background = { color: t.bg };
    sld.addShape(prs.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.09, fill: { color: t.accent }, line: { color: t.accent } });
    sld.addText(s.title, { x: 0.5, y: 0.18, w: 9, h: 0.6, fontSize: 20, bold: true, color: t.title, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });

    const cards = [s.left_card, s.right_card];
    const xs = [0.3, 5.2];
    cards.forEach((card, ci) => {
        if (!card) return;
        const cx = xs[ci];
        sld.addShape(prs.shapes.RECTANGLE, { x: cx, y: 0.95, w: 4.5, h: 4.3, fill: { color: t.cardBg }, line: { color: t.cardBg }, shadow: makeShadow() });
        sld.addShape(prs.shapes.RECTANGLE, { x: cx, y: 0.95, w: 4.5, h: 0.06, fill: { color: t.accent }, line: { color: t.accent } });
        sld.addText(card.title, { x: cx + 0.2, y: 1.1, w: 4.1, h: 0.55, fontSize: 15, bold: true, color: t.title, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
        const items = (card.bullets ?? []).map((b, idx) => ({
            text: b,
            options: { bullet: true, paraSpaceAfter: 6, fontSize: 12, color: t.text, breakLine: idx < (card.bullets?.length ?? 0) - 1 },
        }));
        if (items.length > 0) {
            sld.addText(items, { x: cx + 0.2, y: 1.75, w: 4.1, h: 3.3, fontFace: "Microsoft JhengHei", shrinkText: true });
        }
    });
    addCount(sld, i, total, t.muted);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMultiCardSlide(prs: any, sld: any, s: SlideItem, t: ThemeColors, total: number, i: number) {
    sld.background = { color: t.bg };
    sld.addShape(prs.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.09, fill: { color: t.accent }, line: { color: t.accent } });
    sld.addText(s.title, { x: 0.5, y: 0.18, w: 9, h: 0.6, fontSize: 20, bold: true, color: t.title, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });

    const cards = (s.cards ?? []).slice(0, 6);
    const cols = cards.length <= 3 ? 3 : 3;
    const cardW = cards.length <= 3 ? 2.8 : 2.8;
    const cardH = cards.length <= 3 ? 3.5 : 1.95;
    const startX = cards.length <= 3 ? 0.55 : 0.25;
    const startY = 0.95;

    cards.forEach((card, ci) => {
        const col = ci % cols;
        const row = Math.floor(ci / cols);
        const cx = startX + col * (cardW + 0.25);
        const cy = startY + row * (cardH + 0.2);
        sld.addShape(prs.shapes.RECTANGLE, { x: cx, y: cy, w: cardW, h: cardH, fill: { color: t.cardBg }, line: { color: t.cardBg }, shadow: makeShadow() });
        sld.addShape(prs.shapes.RECTANGLE, { x: cx, y: cy, w: cardW, h: 0.05, fill: { color: t.accent }, line: { color: t.accent } });
        // Unicode icon placeholder (bullet character as icon)
        const iconGlyph = "◆";
        sld.addText(iconGlyph, { x: cx + 0.15, y: cy + 0.15, w: 0.5, h: 0.4, fontSize: 14, color: t.accent, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
        sld.addText(card.title, { x: cx + 0.15, y: cy + 0.55, w: cardW - 0.3, h: 0.5, fontSize: 13, bold: true, color: t.title, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
        if (card.description) {
            sld.addText(card.description, { x: cx + 0.15, y: cy + 1.1, w: cardW - 0.3, h: cardH - 1.25, fontSize: 11, color: t.text, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
        }
    });
    addCount(sld, i, total, t.muted);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTableSlide(prs: any, sld: any, s: SlideItem, t: ThemeColors, total: number, i: number) {
    sld.background = { color: t.bg };
    sld.addShape(prs.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.09, fill: { color: t.accent }, line: { color: t.accent } });
    sld.addText(s.title, { x: 0.5, y: 0.18, w: 9, h: 0.6, fontSize: 20, bold: true, color: t.title, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });

    const headers = s.headers ?? [];
    const rows = (s.rows ?? []).slice(0, 8);
    if (headers.length === 0) {
        addCount(sld, i, total, t.muted);
        return;
    }

    const colCount = headers.length;
    const colW = 9.2 / colCount;
    const tableRows: { text: string; options: Record<string, unknown> }[][] = [];

    // Header row
    tableRows.push(headers.map((h) => ({
        text: h,
        options: { bold: true, color: "FFFFFF", fill: { color: t.accent }, fontSize: 12, align: "center", fontFace: "Microsoft JhengHei" },
    })));

    // Data rows
    rows.forEach((row, ri) => {
        tableRows.push(headers.map((_, ci) => ({
            text: (row[ci] ?? ""),
            options: { color: t.text, fill: { color: ri % 2 === 0 ? t.cardBg : t.bg }, fontSize: 11, fontFace: "Microsoft JhengHei" },
        })));
    });

    sld.addTable(tableRows, {
        x: 0.4, y: 1.0, w: 9.2, colW: Array(colCount).fill(colW),
        border: { color: t.muted, pt: 0.5 },
    });
    addCount(sld, i, total, t.muted);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFlowSlide(prs: any, sld: any, s: SlideItem, t: ThemeColors, total: number, i: number) {
    sld.background = { color: t.bg };
    sld.addShape(prs.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.09, fill: { color: t.accent }, line: { color: t.accent } });
    sld.addText(s.title, { x: 0.5, y: 0.18, w: 9, h: 0.6, fontSize: 20, bold: true, color: t.title, fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });

    const steps = (s.steps ?? []).slice(0, 5);
    if (steps.length === 0) {
        addCount(sld, i, total, t.muted);
        return;
    }

    const stepW = 9.0 / steps.length;
    const circleY = 1.6;
    const circleR = 0.38;

    steps.forEach((step, si) => {
        const cx = 0.5 + si * stepW + stepW / 2 - circleR;
        // Circle
        sld.addShape(prs.shapes.OVAL, { x: cx, y: circleY, w: circleR * 2, h: circleR * 2, fill: { color: t.accent }, line: { color: t.accent } });
        // Step number
        sld.addText(String(si + 1), { x: cx, y: circleY, w: circleR * 2, h: circleR * 2, fontSize: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
        // Arrow connector (except last)
        if (si < steps.length - 1) {
            const arrowX = cx + circleR * 2 + 0.05;
            sld.addShape(prs.shapes.RECTANGLE, { x: arrowX, y: circleY + circleR - 0.02, w: stepW - circleR * 2 - 0.1, h: 0.04, fill: { color: t.muted }, line: { color: t.muted } });
        }
        // Label
        sld.addText(step.label, { x: cx - 0.35, y: circleY + circleR * 2 + 0.15, w: circleR * 2 + 0.7, h: 0.5, fontSize: 12, bold: true, color: t.title, align: "center", fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
        // Description
        if (step.description) {
            sld.addText(step.description, { x: cx - 0.35, y: circleY + circleR * 2 + 0.75, w: circleR * 2 + 0.7, h: 1.8, fontSize: 10, color: t.text, align: "center", fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
        }
    });
    addCount(sld, i, total, t.muted);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildHeroTextSlide(prs: any, sld: any, s: SlideItem, t: ThemeColors, total: number, i: number) {
    // Full-page dark accent background
    sld.background = { color: t.accent };
    // Subtle corner decorations
    sld.addShape(prs.shapes.RECTANGLE, { x: 0, y: 0, w: 1.5, h: 0.08, fill: { color: "FFFFFF" }, line: { color: "FFFFFF" } });
    sld.addShape(prs.shapes.RECTANGLE, { x: 0, y: 0, w: 0.08, h: 1.5, fill: { color: "FFFFFF" }, line: { color: "FFFFFF" } });
    sld.addShape(prs.shapes.RECTANGLE, { x: 8.5, y: 5.545, w: 1.5, h: 0.08, fill: { color: "FFFFFF" }, line: { color: "FFFFFF" } });
    sld.addShape(prs.shapes.RECTANGLE, { x: 9.92, y: 4.1, w: 0.08, h: 1.5, fill: { color: "FFFFFF" }, line: { color: "FFFFFF" } });
    // Large centred title
    sld.addText(s.title, { x: 0.7, y: 1.3, w: 8.6, h: 1.8, fontSize: 38, bold: true, color: "FFFFFF", align: "center", fontFace: "Microsoft JhengHei", valign: "middle", margin: 0 });
    if (s.subtitle) {
        sld.addText(s.subtitle, { x: 0.7, y: 3.3, w: 8.6, h: 1.0, fontSize: 18, color: "FFFFFF", align: "center", fontFace: "Microsoft JhengHei", margin: 0, shrinkText: true });
    }
    sld.addText(`${i + 1} / ${total}`, { x: 8.7, y: 5.2, w: 1.1, h: 0.3, fontSize: 9, color: "FFFFFF", align: "right", margin: 0 });
}

// ── PPTX download ─────────────────────────────────────────────

async function downloadPptx(data: SlidesContent) {
    const pptxgen = (await import("pptxgenjs")).default;
    const prs = new pptxgen();
    prs.layout = "LAYOUT_16x9"; // 10" × 5.625"

    const themeName = data.theme ?? "tech-innovation";
    const baseTheme = SLIDE_THEMES[themeName] ?? SLIDE_THEMES["tech-innovation"];
    const accentOverride = /^[0-9A-Fa-f]{6}$/.test(data.accent_color ?? "") ? data.accent_color! : baseTheme.accent;
    const t: ThemeColors = { ...baseTheme, accent: accentOverride };

    const total = data.slides.length;
    data.slides.forEach((slide, i) => {
        const sld = prs.addSlide();
        const layout = slide.layout_type ?? "content";

        if (layout === "cover")           buildCoverSlide(prs, sld, slide, t, total, i);
        else if (layout === "stats")      buildStatsSlide(prs, sld, slide, t, total, i);
        else if (layout === "quote")      buildQuoteSlide(prs, sld, slide, t, total, i);
        else if (layout === "section")    buildSectionSlide(prs, sld, slide, t, total, i);
        else if (layout === "conclusion") buildConclusionSlide(prs, sld, slide, t, total, i);
        else if (layout === "big_number") buildBigNumberSlide(prs, sld, slide, t, total, i);
        else if (layout === "dual_card")  buildDualCardSlide(prs, sld, slide, t, total, i);
        else if (layout === "multi_card") buildMultiCardSlide(prs, sld, slide, t, total, i);
        else if (layout === "table")      buildTableSlide(prs, sld, slide, t, total, i);
        else if (layout === "flow")       buildFlowSlide(prs, sld, slide, t, total, i);
        else if (layout === "hero_text")  buildHeroTextSlide(prs, sld, slide, t, total, i);
        else                              buildContentSlide(prs, sld, slide, t, total, i);
    });

    prs.writeFile({ fileName: `${data.title || "簡報"}.pptx` });
}

// ── Slide thumbnail (server-rendered preview) ─────────────────

function SlideThumbnail({
    artifactId,
    index,
    onError,
}: {
    artifactId: number;
    index: number;
    onError: () => void;
}) {
    const url = `/thumbnails/${artifactId}/slide_${String(index).padStart(3, "0")}.jpg`;
    return (
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <img
                src={url}
                alt={`投影片 ${index + 1}`}
                onError={onError}
                className="absolute inset-0 w-full h-full object-cover rounded-t-xl"
            />
        </div>
    );
}

// ── Slide card text renderers by layout ───────────────────────

function SlideCardText({ slide, index, total }: { slide: SlideItem; index: number; total: number }) {
    const layout = slide.layout_type ?? "content";

    const header = (
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                    {index + 1} / {total}
                </span>
                <span className="text-xs text-gray-400">{layout}</span>
            </div>
            <h4 className="font-bold text-gray-800 text-base leading-snug">{slide.title}</h4>
            {slide.subtitle && <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{slide.subtitle}</p>}
        </div>
    );

    if (layout === "big_number") {
        return (
            <div className="rounded-xl border-2 border-gray-200 bg-white min-h-[260px] flex flex-col shadow-sm overflow-hidden">
                {header}
                <div className="flex flex-col items-center justify-center flex-1 py-6 gap-1">
                    <div className="text-6xl font-black text-blue-600 leading-none">
                        {slide.metric ?? "—"}{slide.unit && <span className="text-3xl ml-1">{slide.unit}</span>}
                    </div>
                    {slide.label && <p className="text-base text-gray-600 mt-2">{slide.label}</p>}
                    {slide.bullets[0] && <p className="text-xs text-gray-400 mt-1">{slide.bullets[0]}</p>}
                </div>
            </div>
        );
    }

    if (layout === "dual_card") {
        return (
            <div className="rounded-xl border-2 border-gray-200 bg-white min-h-[260px] flex flex-col shadow-sm overflow-hidden">
                {header}
                <div className="flex gap-3 p-4 flex-1">
                    {[slide.left_card, slide.right_card].map((card, ci) => card && (
                        <div key={ci} className="flex-1 bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <p className="font-semibold text-gray-700 text-sm mb-2">{card.title}</p>
                            <ul className="flex flex-col gap-1.5">
                                {(card.bullets ?? []).map((b, bi) => (
                                    <li key={bi} className="flex items-start gap-2 text-xs text-gray-600">
                                        <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
                                        {b}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (layout === "multi_card") {
        const cards: SlideCardData[] = slide.cards ?? [];
        return (
            <div className="rounded-xl border-2 border-gray-200 bg-white min-h-[260px] flex flex-col shadow-sm overflow-hidden">
                {header}
                <div className="grid grid-cols-2 gap-3 p-4 flex-1">
                    {cards.slice(0, 6).map((card, ci) => (
                        <div key={ci} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-blue-500 text-sm">◆</span>
                                <p className="font-semibold text-gray-700 text-xs">{card.title}</p>
                            </div>
                            {card.description && <p className="text-xs text-gray-500 leading-relaxed">{card.description}</p>}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (layout === "table") {
        const headers = slide.headers ?? [];
        const rows = slide.rows ?? [];
        return (
            <div className="rounded-xl border-2 border-gray-200 bg-white min-h-[260px] flex flex-col shadow-sm overflow-hidden">
                {header}
                <div className="p-4 overflow-auto flex-1">
                    {headers.length > 0 ? (
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr>
                                    {headers.map((h, hi) => (
                                        <th key={hi} className="bg-blue-500 text-white px-3 py-1.5 text-left font-semibold border border-blue-400">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, ri) => (
                                    <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                        {headers.map((_, ci) => (
                                            <td key={ci} className="px-3 py-1.5 text-gray-700 border border-gray-200">{row[ci] ?? ""}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="text-xs text-gray-400">（無表格資料）</p>
                    )}
                </div>
            </div>
        );
    }

    if (layout === "flow") {
        const steps = slide.steps ?? [];
        return (
            <div className="rounded-xl border-2 border-gray-200 bg-white min-h-[260px] flex flex-col shadow-sm overflow-hidden">
                {header}
                <div className="flex items-start gap-2 p-4 overflow-x-auto flex-1">
                    {steps.map((step, si) => (
                        <div key={si} className="flex items-start gap-2 min-w-0">
                            <div className="flex flex-col items-center gap-1">
                                <div className="w-8 h-8 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                    {si + 1}
                                </div>
                                <div className="flex-1 text-center">
                                    <p className="font-semibold text-gray-700 text-xs mt-1">{step.label}</p>
                                    {step.description && <p className="text-xs text-gray-500 mt-0.5 leading-tight">{step.description}</p>}
                                </div>
                            </div>
                            {si < steps.length - 1 && (
                                <div className="mt-3.5 text-gray-300 text-sm flex-shrink-0">→</div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (layout === "hero_text") {
        return (
            <div className="rounded-xl border-2 border-blue-500 bg-blue-600 min-h-[260px] flex flex-col shadow-sm overflow-hidden">
                <div className="flex flex-col items-center justify-center flex-1 p-8 text-center gap-3">
                    <span className="text-xs font-medium text-blue-200 bg-blue-700 px-2 py-0.5 rounded-full">
                        {index + 1} / {total}
                    </span>
                    <h4 className="font-black text-white text-2xl leading-snug">{slide.title}</h4>
                    {slide.subtitle && <p className="text-blue-100 text-sm leading-relaxed">{slide.subtitle}</p>}
                </div>
            </div>
        );
    }

    // Default: content, stats, quote, section, conclusion — bullet list
    return (
        <div className="rounded-xl border-2 border-gray-200 bg-white min-h-[260px] flex flex-col shadow-sm overflow-hidden">
            {header}
            <ul className="px-5 py-4 flex flex-col gap-3 flex-1">
                {slide.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-700 leading-relaxed">
                        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                        {b}
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ── Slide card (thumbnail + text fallback) ────────────────────

function SlideCardDisplay({
    slide,
    index,
    total,
    artifactId,
}: {
    slide: SlideItem;
    index: number;
    total: number;
    artifactId?: number;
}) {
    const [thumbFailed, setThumbFailed] = useState(false);
    const showThumb = artifactId != null && !thumbFailed;

    if (showThumb) {
        return (
            <div className="rounded-xl border-2 border-gray-200 bg-white shadow-sm overflow-hidden">
                <SlideThumbnail artifactId={artifactId} index={index} onError={() => setThumbFailed(true)} />
                <div className="px-5 py-3 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                            {index + 1} / {total}
                        </span>
                    </div>
                    <p className="font-semibold text-gray-800 text-sm leading-snug">{slide.title}</p>
                </div>
            </div>
        );
    }

    return <SlideCardText slide={slide} index={index} total={total} />;
}

// ── Main ──────────────────────────────────────────────────────

export function SlidesViewer({ data, artifactId }: Props) {
    const [index, setIndex] = useState(0);
    const total = data.slides.length;
    const slide = data.slides[index];

    return (
        <div className="flex flex-col gap-4">
            {/* Title + download */}
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-gray-800">{data.title}</h3>
                <button
                    onClick={() => downloadPptx(data)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                    title="下載 PPTX"
                >
                    <Download className="w-3.5 h-3.5" />
                    下載
                </button>
            </div>

            {/* Slide card — shows thumbnail when available, text fallback otherwise */}
            <SlideCardDisplay slide={slide} index={index} total={total} artifactId={artifactId} />

            {/* Navigation */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    disabled={index === 0}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-sm transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" /> 上一頁
                </button>
                <div className="flex gap-1">
                    {data.slides.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setIndex(i)}
                            className={`w-2 h-2 rounded-full transition-colors ${i === index ? "bg-blue-500" : "bg-gray-300 hover:bg-gray-400"}`}
                        />
                    ))}
                </div>
                <button
                    onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                    disabled={index === total - 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-30 text-sm transition-colors"
                >
                    下一頁 <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
