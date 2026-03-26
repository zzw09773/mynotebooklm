"use strict";

const fs = require("fs");
const path = require("path");

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
        console.error(`[icon_utils] Unknown icon: ${iconName}`);
        return;
    }
    // Guard: colorHex might be null, undefined, or a non-string (e.g. a number)
    const colorStr = (colorHex == null) ? "000000" : String(colorHex).replace(/^#/, "");
    const color = `#${colorStr}`;
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

module.exports = { addIcon, ICONS };
