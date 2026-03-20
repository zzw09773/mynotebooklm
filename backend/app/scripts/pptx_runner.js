/**
 * pptx_runner.js — Execute LLM-generated PptxGenJS code in a vm sandbox.
 *
 * Usage:
 *   node pptx_runner.js <code_file.js> <output.pptx>
 *
 * The code file should be a JavaScript snippet that uses `pres` (PptxGenJS instance)
 * and optionally `addIcon(sld, iconName, colorHex, x, y, w, h)`.
 * The snippet must NOT call pres.writeFile() — the runner handles that.
 */

"use strict";

const vm = require("vm");
const fs = require("fs");
const path = require("path");

const PptxGenJS = require("pptxgenjs");

// Load icon registry (SVG path data extracted from react-icons source)
const ICON_REGISTRY_PATH = path.join(__dirname, "../data/icon_registry.json");
const ICONS = JSON.parse(fs.readFileSync(ICON_REGISTRY_PATH, "utf8"));

/**
 * Embed a react-icon as an SVG image into a slide.
 * @param {object} sld - PptxGenJS slide object
 * @param {string} iconName - Icon name, e.g. "FaRocket"
 * @param {string} colorHex - Fill color with or without '#', e.g. "0066FF" or "#0066FF"
 * @param {number} x - X position in inches
 * @param {number} y - Y position in inches
 * @param {number} w - Width in inches
 * @param {number} h - Height in inches
 */
function addIcon(sld, iconName, colorHex, x, y, w, h) {
    const entry = ICONS[iconName];
    if (!entry) {
        console.error(`[pptx_runner] Unknown icon: ${iconName}`);
        return;
    }
    const color = colorHex.startsWith("#") ? colorHex : `#${colorHex}`;
    const pathEls = entry.paths
        .map((d) => `<path d="${d}" fill="${color}"/>`)
        .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${entry.viewBox}">${pathEls}</svg>`;
    const b64 = Buffer.from(svg).toString("base64");
    sld.addImage({
        data: `data:image/svg+xml;base64,${b64}`,
        x,
        y,
        w,
        h,
    });
}

// ── Main ──────────────────────────────────────────────────────

const codeFile = process.argv[2];
const outputPath = process.argv[3];

if (!codeFile || !outputPath) {
    console.error("Usage: node pptx_runner.js <code_file.js> <output.pptx>");
    process.exit(1);
}

const code = fs.readFileSync(codeFile, "utf8");
const pres = new PptxGenJS();

// Sandbox: only expose pres, PptxGenJS class, and addIcon helper.
// vm.runInContext prevents access to require, process, fs, etc.
const sandbox = vm.createContext({
    pres,
    PptxGenJS,
    addIcon,
    // Provide a safe console for debugging
    console: {
        log: (...args) => process.stderr.write("[slide] " + args.join(" ") + "\n"),
        error: (...args) => process.stderr.write("[slide:err] " + args.join(" ") + "\n"),
    },
});

try {
    vm.runInContext(code, sandbox, {
        timeout: 30000,         // 30s max execution time
        displayErrors: true,
    });
} catch (err) {
    console.error(`[pptx_runner] Code execution failed: ${err.message}`);
    process.exit(1);
}

// Write the PPTX — pres.writeFile returns a Promise
pres.writeFile({ fileName: outputPath })
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error(`[pptx_runner] writeFile failed: ${err.message}`);
        process.exit(1);
    });
