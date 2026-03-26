"use strict";

const fs = require("fs");
const PptxGenJS = require("pptxgenjs");
const { addIcon } = require("./icon_utils");

const THEMES = {
    tech:   { bg:"1E1E1E", accent:"0066FF", title:"FFFFFF", text:"CCCCCC", muted:"888888", cardBg:"2A2A2A" },
    ocean:  { bg:"1A2332", accent:"2D8B8B", title:"F1FAEE", text:"A8DADC", muted:"5A8A8A", cardBg:"243040" },
    golden: { bg:"4A403A", accent:"F4A900", title:"D4B896", text:"D4B896", muted:"C1666B", cardBg:"5A4E47" },
    frost:  { bg:"FAFAFA", accent:"4A6FA5", title:"1A2332", text:"334155", muted:"909090", cardBg:"D4E4F7" },
    garden: { bg:"F5F3ED", accent:"4A7C59", title:"333333", text:"555555", muted:"B7472A", cardBg:"EBE9E1" },
    sports: { bg:"1B1F3B", accent:"E63946", title:"FFFFFF", text:"D0D0D0", muted:"6C7A96", cardBg:"252A4A" },
};
const FONT = "Microsoft JhengHei";

function addSlide(pres, theme) {
    const sld = pres.addSlide();
    sld.background = { color: theme.bg };
    return { sld, t: theme };
}

function addHeader(sld, t, titleText) {
    // Accent top bar
    sld.addShape("rect", { x: 0, y: 0, w: 10, h: 0.06, fill: { color: t.accent }, line: { color: t.accent, size: 0 } });
    // Title text
    sld.addText(titleText, { x: 0.5, y: 0.12, w: 9, h: 0.6, fontSize: 24, bold: true, color: t.title, fontFace: FONT, shrinkText: true });
}

function renderCover(pres, theme, data) {
    const { sld, t } = addSlide(pres, theme);
    // Accent top bar
    sld.addShape("rect", { x: 0, y: 0, w: 10, h: 0.06, fill: { color: t.accent }, line: { color: t.accent, size: 0 } });
    // Left decoration line
    sld.addShape("rect", { x: 0.5, y: 1.5, w: 0.07, h: 2.4, fill: { color: t.accent }, line: { color: t.accent, size: 0 } });
    // Main title
    sld.addText(data.title, { x: 0.85, y: 1.5, w: 8.5, h: 1.1, fontSize: 40, bold: true, color: t.title, fontFace: FONT, shrinkText: true });
    // Subtitle (if present)
    if (data.subtitle) {
        sld.addText(data.subtitle, { x: 0.85, y: 2.85, w: 8.5, h: 0.6, fontSize: 18, color: t.muted, fontFace: FONT, shrinkText: true });
    }
    // Bottom-right block
    sld.addShape("rect", { x: 8.8, y: 4.6, w: 1, h: 0.8, fill: { color: t.accent }, line: { color: t.accent, size: 0 } });
}

function renderSectionDivider(pres, theme, data) {
    // Section divider uses accent as background
    const sld = pres.addSlide();
    sld.background = { color: theme.accent };
    // Label (if present)
    if (data.label) {
        sld.addText(data.label, { x: 0.8, y: 1.2, w: 8.4, h: 0.4, fontSize: 14, color: theme.bg, charSpacing: 4, fontFace: FONT, shrinkText: true });
    }
    // Main title
    sld.addText(data.title, { x: 0.8, y: 1.8, w: 8.4, h: 1.0, fontSize: 36, color: "FFFFFF", bold: true, fontFace: FONT, shrinkText: true });
    // Description (if present)
    if (data.description) {
        sld.addText(data.description, { x: 0.8, y: 3.3, w: 8.4, h: 0.6, fontSize: 16, color: "FFFFFF", fontFace: FONT, shrinkText: true });
    }
}

function renderBigNumber(pres, theme, data) {
    const { sld, t } = addSlide(pres, theme);
    addHeader(sld, t, data.title);
    const items = data.items;

    if (items.length === 1) {
        sld.addText(items[0].value, { x: 0.5, y: 1.4, w: 9, h: 2.2, fontSize: 100, bold: true, color: t.accent, align: "center", fontFace: FONT, shrinkText: true });
        if (items[0].unit) {
            sld.addText(items[0].unit, { x: 0.5, y: 3.7, w: 9, h: 0.4, fontSize: 18, color: t.text, align: "center", fontFace: FONT, shrinkText: true });
        }
        if (items[0].label) {
            sld.addText(items[0].label, { x: 0.5, y: 4.15, w: 9, h: 0.4, fontSize: 14, color: t.muted, align: "center", fontFace: FONT, shrinkText: true });
        }
    } else {
        const N = items.length;
        const cardW = 2.7;
        const gap = 0.45;
        const totalW = N * cardW + (N - 1) * gap;
        const startX = (10 - totalW) / 2;
        for (let i = 0; i < N; i++) {
            const item = items[i];
            const cx = startX + i * (cardW + gap);
            // Card background
            sld.addShape("rect", { x: cx, y: 1.1, w: cardW, h: 3.6, fill: { color: t.cardBg }, line: { color: t.cardBg, size: 0 }, rectRadius: 0.1 });
            // Accent top
            sld.addShape("rect", { x: cx, y: 1.1, w: cardW, h: 0.08, fill: { color: t.accent }, line: { color: t.accent, size: 0 } });
            // Value
            sld.addText(item.value, { x: cx + 0.1, y: 1.5, w: cardW - 0.2, h: 1.2, fontSize: 52, bold: true, color: t.accent, align: "center", fontFace: FONT, shrinkText: true });
            // Unit
            if (item.unit) {
                sld.addText(item.unit, { x: cx + 0.1, y: 2.75, w: cardW - 0.2, h: 0.4, fontSize: 14, color: t.text, align: "center", fontFace: FONT, shrinkText: true });
            }
            // Label
            if (item.label) {
                sld.addText(item.label, { x: cx + 0.1, y: 3.2, w: cardW - 0.2, h: 0.4, fontSize: 13, color: t.muted, align: "center", fontFace: FONT, shrinkText: true });
            }
        }
    }
}

function renderCardGrid(pres, theme, data) {
    const { sld, t } = addSlide(pres, theme);
    addHeader(sld, t, data.title);
    const N = data.cards.length;
    const cardW = 2.7;
    const gap = 0.45;
    const totalW = N * cardW + (N - 1) * gap;
    const startX = (10 - totalW) / 2;
    for (let i = 0; i < N; i++) {
        const card = data.cards[i];
        const cx = startX + i * (cardW + gap);
        // Card background
        sld.addShape("rect", { x: cx, y: 1.1, w: cardW, h: 3.6, fill: { color: t.cardBg }, line: { color: t.cardBg, size: 0 }, rectRadius: 0.1 });
        // Accent top
        sld.addShape("rect", { x: cx, y: 1.1, w: cardW, h: 0.08, fill: { color: t.accent }, line: { color: t.accent, size: 0 } });
        // Icon
        if (card.icon) {
            addIcon(sld, card.icon, "#" + t.accent, cx + (cardW - 0.45) / 2, 1.35, 0.45, 0.45);
        }
        // Title
        sld.addText(card.title, { x: cx + 0.1, y: 2.0, w: cardW - 0.2, h: 0.55, fontSize: 16, bold: true, color: t.title, align: "center", fontFace: FONT, shrinkText: true });
        // Description
        if (card.description) {
            sld.addText(card.description, { x: cx + 0.1, y: 2.6, w: cardW - 0.2, h: 1.9, fontSize: 12, color: t.text, align: "center", fontFace: FONT, shrinkText: true });
        }
    }
}

function renderDualColumn(pres, theme, data) {
    const { sld, t } = addSlide(pres, theme);
    addHeader(sld, t, data.title);
    const sides = [
        { side: data.left, x: 0.4 },
        { side: data.right, x: 5.25 },
    ];
    for (const { side, x } of sides) {
        if (!side) continue;
        // Card background
        sld.addShape("rect", { x, y: 1.15, w: 4.35, h: 3.6, fill: { color: t.cardBg }, line: { color: t.cardBg, size: 0 }, rectRadius: 0.1 });
        // Accent top
        sld.addShape("rect", { x, y: 1.15, w: 4.35, h: 0.08, fill: { color: t.accent }, line: { color: t.accent, size: 0 } });
        // Icon
        if (side.icon) {
            addIcon(sld, side.icon, "#" + t.accent, x + 0.15, 1.35, 0.6, 0.6);
        }
        // Title
        sld.addText(side.title, { x: x + 0.15, y: 2.1, w: 4.05, h: 0.55, fontSize: 18, bold: true, color: t.title, fontFace: FONT, shrinkText: true });
        // Points
        if (side.points) {
            for (let j = 0; j < side.points.length; j++) {
                sld.addText("• " + side.points[j], { x: x + 0.15, y: 2.75 + j * 0.45, w: 4.05, h: 0.4, fontSize: 13, color: t.text, fontFace: FONT, shrinkText: true });
            }
        }
    }
    // VS label in center
    sld.addText("VS", { x: 4.55, y: 2.3, w: 0.9, h: 0.7, fontSize: 20, bold: true, color: t.accent, align: "center", fontFace: FONT, shrinkText: true });
}

function renderProcessFlow(pres, theme, data) {
    const { sld, t } = addSlide(pres, theme);
    addHeader(sld, t, data.title);
    const N = data.steps.length;
    const circR = 0.35;
    const circD = circR * 2; // 0.7
    const startX = 0.5 + circR; // 0.85 (circle center x of first step)
    const gap = (9.0 - N * circD) / (N - 1); // space between circles

    for (let i = 0; i < N; i++) {
        const step = data.steps[i];
        const cx = startX + i * (circD + gap); // circle center x
        // Connector line between circles (not for last step)
        if (i < N - 1) {
            const lineX = cx + circR;
            const lineW = gap;
            sld.addShape("rect", { x: lineX, y: 1.815, w: lineW, h: 0.07, fill: { color: t.muted }, line: { color: t.muted, size: 0 } });
        }
        // Circle
        sld.addShape("ellipse", { x: cx - circR, y: 1.15, w: circD, h: circD, fill: { color: t.accent }, line: { color: t.accent, size: 0 } });
        // Step number
        sld.addText(String(i + 1), { x: cx - circR, y: 1.15, w: circD, h: circD, fontSize: 16, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: FONT, shrinkText: true });
        // Step title
        sld.addText(step.title, { x: cx - 0.6, y: 2.5, w: 1.2, h: 0.5, fontSize: 14, bold: true, color: t.title, align: "center", fontFace: FONT, shrinkText: true });
        // Step description
        if (step.description) {
            sld.addText(step.description, { x: cx - 0.6, y: 2.95, w: 1.2, h: 0.9, fontSize: 11, color: t.text, align: "center", fontFace: FONT, shrinkText: true });
        }
    }
}

function renderContentWithIcon(pres, theme, data) {
    const { sld, t } = addSlide(pres, theme);
    addHeader(sld, t, data.title);
    // Left icon
    const iconName = data.icon || (data.blocks && data.blocks[0] && data.blocks[0].icon) || null;
    if (iconName) {
        addIcon(sld, iconName, "#" + t.accent, 0.5, 1.4, 0.9, 0.9);
    }
    // Vertical separator line
    sld.addShape("rect", { x: 1.7, y: 1.3, w: 0.04, h: 3.2, fill: { color: t.accent }, line: { color: t.accent, size: 0 } });
    // Blocks on the right
    if (data.blocks) {
        for (let i = 0; i < data.blocks.length; i++) {
            const block = data.blocks[i];
            const yPos = 1.4 + i * 1.1;
            sld.addText(block.title, { x: 2.0, y: yPos, w: 7.5, h: 0.45, fontSize: 16, bold: true, color: t.title, fontFace: FONT, shrinkText: true });
            sld.addText(block.description, { x: 2.0, y: yPos + 0.45, w: 7.5, h: 0.55, fontSize: 13, color: t.text, fontFace: FONT, shrinkText: true });
        }
    }
}

function renderQuote(pres, theme, data) {
    // Quote slide uses cardBg as background
    const sld = pres.addSlide();
    sld.background = { color: theme.cardBg };
    // Quote mark
    sld.addText("\u201C", { x: 0.5, y: 0.3, w: 2, h: 1.5, fontSize: 80, color: theme.accent, fontFace: FONT, shrinkText: true });
    // Quote text
    sld.addText(data.quote, { x: 1.2, y: 1.7, w: 7.6, h: 1.8, fontSize: 24, italic: true, color: theme.title, align: "center", fontFace: FONT, shrinkText: true });
    // Separator line
    sld.addShape("rect", { x: 3.5, y: 3.9, w: 3, h: 0.04, fill: { color: theme.accent }, line: { color: theme.accent, size: 0 } });
    // Source (if present)
    if (data.source) {
        sld.addText("— " + data.source, { x: 1.2, y: 4.1, w: 7.6, h: 0.4, fontSize: 14, color: theme.muted, align: "center", fontFace: FONT, shrinkText: true });
    }
}

function renderTable(pres, theme, data) {
    const { sld, t } = addSlide(pres, theme);
    addHeader(sld, t, data.title);
    // Build rows array for PptxGenJS addTable
    // Header row
    const headerRow = data.headers.map(h => ({
        text: h,
        options: { bold: true, color: "FFFFFF", fill: { color: t.accent }, fontSize: 13, fontFace: FONT }
    }));
    // Data rows (alternating fill: cardBg / bg)
    const dataRows = data.rows.map((row, ri) =>
        row.map(cell => ({
            text: cell,
            options: { color: t.text, fill: { color: ri % 2 === 0 ? t.cardBg : t.bg }, fontSize: 12, fontFace: FONT }
        }))
    );
    sld.addTable([headerRow, ...dataRows], {
        x: 0.5,
        y: 1.1,
        w: 9,
        colW: Array(data.headers.length).fill(9 / data.headers.length),
        border: { type: "none" }
    });
}

function renderChart(pres, theme, data) {
    const { sld, t } = addSlide(pres, theme);
    addHeader(sld, t, data.title);
    const chartData = [{ name: data.title, labels: data.labels, values: data.values }];
    try {
        if (data.chart_type === "BAR") {
            sld.addChart(pres.ChartType.bar, chartData, {
                x: 0.8, y: 1.2, w: 8.4, h: 3.8,
                barDir: "col",
                chartColors: [t.accent],
                showValue: true,
                valAxisLabelFontSize: 11,
                catAxisLabelFontSize: 11,
                dataLabelFontSize: 11,
                dataLabelColor: t.title,
            });
        } else {
            // PIE
            sld.addChart(pres.ChartType.pie, chartData, {
                x: 2.5, y: 1.2, w: 5, h: 3.8,
                showPercent: true,
                chartColors: [t.accent, t.muted, t.text, "4CAF50", "FF9800", "9C27B0", "F44336", "2196F3"],
                dataLabelFontSize: 12,
            });
        }
    } catch (err) {
        // Fallback: render chart data as a table if addChart fails
        console.error(`[slides_renderer] renderChart failed (${err.message}) — falling back to text`);
        const rows = data.labels.map((label, i) => [
            { text: label, options: { color: t.text, fontSize: 13, fontFace: FONT } },
            { text: String(data.values[i] || ""), options: { color: t.accent, fontSize: 13, bold: true, fontFace: FONT } },
        ]);
        sld.addTable(rows, { x: 1.5, y: 1.3, w: 7, colW: [5, 2] });
    }
}

function renderConclusion(pres, theme, data) {
    const { sld, t } = addSlide(pres, theme);
    // Accent top bar (same as addHeader's bar)
    sld.addShape("rect", { x: 0, y: 0, w: 10, h: 0.06, fill: { color: t.accent }, line: { color: t.accent, size: 0 } });
    // Larger title (don't call addHeader, implement directly)
    sld.addText(data.title, { x: 0.5, y: 0.5, w: 9, h: 0.8, fontSize: 28, bold: true, color: t.title, fontFace: FONT, shrinkText: true });
    // Accent line
    sld.addShape("rect", { x: 0.5, y: 1.35, w: 2, h: 0.06, fill: { color: t.accent }, line: { color: t.accent, size: 0 } });
    // Summary (if present)
    if (data.summary) {
        sld.addText(data.summary, { x: 0.5, y: 1.55, w: 9, h: 0.55, fontSize: 16, italic: true, color: t.accent, fontFace: FONT, shrinkText: true });
    }
    // Points
    if (data.points) {
        for (let i = 0; i < data.points.length; i++) {
            const point = data.points[i];
            const yPos = 1.9 + i * 1.0;
            // Point card background
            sld.addShape("rect", { x: 0.5, y: yPos, w: 9, h: 0.75, fill: { color: t.cardBg }, line: { color: t.cardBg, size: 0 }, rectRadius: 0.08 });
            // Icon
            addIcon(sld, point.icon || "FaCheck", "#" + t.accent, 0.65, yPos + 0.15, 0.4, 0.4);
            // Point text
            sld.addText(point.text, { x: 1.2, y: yPos + 0.15, w: 8.1, h: 0.45, fontSize: 15, color: t.title, fontFace: FONT, shrinkText: true });
        }
    }
}

const RENDERERS = {
    cover: renderCover,
    section_divider: renderSectionDivider,
    big_number: renderBigNumber,
    card_grid: renderCardGrid,
    dual_column: renderDualColumn,
    process_flow: renderProcessFlow,
    content_with_icon: renderContentWithIcon,
    quote_slide: renderQuote,
    table: renderTable,
    chart: renderChart,
    conclusion: renderConclusion,
};

// Main
const jsonFile = process.argv[2];
const outputPath = process.argv[3];
if (!jsonFile || !outputPath) {
    console.error("Usage: node slides_renderer.js <slides.json> <output.pptx>");
    process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
const theme = THEMES[spec.theme] || THEMES.tech;
const pres = new PptxGenJS();
pres.defineLayout({ name: "16x9", width: 10, height: 5.625 });
pres.layout = "16x9";

for (const slideData of spec.slides) {
    const renderer = RENDERERS[slideData.layout];
    if (!renderer) {
        console.error(`[slides_renderer] Unknown layout: ${slideData.layout} — skipping`);
        continue;
    }
    renderer(pres, theme, slideData);
}

pres.writeFile({ fileName: outputPath })
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(`[slides_renderer] writeFile failed: ${err.message}`);
        process.exit(1);
    });
