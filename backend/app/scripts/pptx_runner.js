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

const PptxGenJS = require("pptxgenjs");
const { addIcon } = require("./icon_utils");

// ── Main ──────────────────────────────────────────────────────

const codeFile = process.argv[2];
const outputPath = process.argv[3];

if (!codeFile || !outputPath) {
    console.error("Usage: node pptx_runner.js <code_file.js> <output.pptx>");
    process.exit(1);
}

let code = fs.readFileSync(codeFile, "utf8");

// Fix common LLM mistakes before execution
code = code.replace(/pres\.ShapeType\.circle\b/g, "pres.ShapeType.ellipse");
// Replace let/const with var to allow variable re-declaration across slides
// (LLMs often reuse variable names like startX/cols/rows in different slide blocks)
code = code.replace(/\bconst\b/g, "var");
code = code.replace(/\blet\b/g, "var");
// Fix: LLM sometimes calls sld.addIcon() as a method instead of the global addIcon(sld, ...)
// Match any slide variable name (sld, sld1, sld2, slide, etc.)
code = code.replace(/(\bsld\w*)\.addIcon\(/g, "addIcon($1, ");
// Fix: LLM sometimes chains non-existent methods on addText/addShape return values
// e.g. sld.addText(...).setTextColor("FF0000") or var tx = sld.addText(...); tx.setFontSize(18)
// These methods don't exist in PptxGenJS — strip them to prevent crashes.
code = code.replace(/\.\s*(?:setTextColor|setFontSize|setFont|setBold|setItalic|setUnderline|setAlign|setValign)\s*\([^)]*\)/g, "");
// Note: automatic quote-mismatch repair is NOT done here — a simple regex
// cannot distinguish between a genuine mismatch and valid code like '"' (a
// string whose content is a double-quote character).  Mismatched quotes in
// LLM output must be caught by re-generation or prompt improvement.

const pres = new PptxGenJS();

// ── Compatibility shims ───────────────────────────────────────
// LLMs frequently generate calls like:
//   sld.addText({text: "...", x: 1, fontSize: 18})   ← wrong: 1 arg with text inside
//   sld.addShape({type: "rect", fill: "FF0000", ...}) ← wrong: 1 arg with type inside
// The correct PptxGenJS API is:
//   sld.addText("...", {x: 1, fontSize: 18})
//   sld.addShape("rect", {fill: {color:"FF0000"}, ...})
//
// We patch pres.addSlide so every returned slide has corrected addText/addShape.

function _stripHash(color) {
    return typeof color === "string" && color.startsWith("#") ? color.slice(1) : color;
}

function _normalizeFill(fill) {
    if (!fill) return fill;
    if (typeof fill === "string") return { color: _stripHash(fill) };
    if (fill.color) return { ...fill, color: _stripHash(fill.color) };
    return fill;
}

const _origAddSlide = pres.addSlide.bind(pres);
pres.addSlide = function(opts) {
    // Strip # from bkgd so PptxGenJS accepts it
    if (opts && typeof opts.bkgd === "string" && opts.bkgd.startsWith("#")) {
        opts = { ...opts, bkgd: opts.bkgd.slice(1) };
    }
    const sld = _origAddSlide(opts);

    // addText shim: sld.addText({text, ...opts}) → sld.addText(text, opts)
    const _origAddText = sld.addText.bind(sld);
    sld.addText = function(textOrObj, textOpts) {
        if (textOrObj !== null && typeof textOrObj === "object" && !Array.isArray(textOrObj) && "text" in textOrObj) {
            const { text, ...rest } = textOrObj;
            textOpts = Object.assign({}, rest, textOpts || {});
            textOrObj = text;
        }
        // Ensure textOrObj is a valid type (string or array) — prevents
        // PptxGenJS internal "newObject.text.forEach is not a function"
        if (textOrObj == null) textOrObj = "";
        if (typeof textOrObj !== "string" && !Array.isArray(textOrObj)) {
            textOrObj = String(textOrObj);
        }
        // Guard: textOpts must be a plain object — LLM sometimes passes a string
        // literal like "{fontSize:40,color:theme.title}" which causes
        // "Cannot create property 'color' on string '...'" inside PptxGenJS
        if (typeof textOpts === "string") {
            textOpts = {};
        }
        if (textOpts && textOpts.color) textOpts.color = _stripHash(textOpts.color);
        if (textOpts && textOpts.fill)  textOpts.fill  = _normalizeFill(textOpts.fill);
        return _origAddText(textOrObj, textOpts);
    };

    // addShape shim: sld.addShape({type, fill, ...opts}) → sld.addShape(type, opts)
    const _origAddShape = sld.addShape.bind(sld);
    sld.addShape = function(shapeOrType, shapeOpts) {
        if (shapeOrType !== null && typeof shapeOrType === "object" && "type" in shapeOrType) {
            const { type, ...rest } = shapeOrType;
            shapeOpts = Object.assign({}, rest, shapeOpts || {});
            shapeOrType = type;
        }
        if (shapeOpts && shapeOpts.fill)  shapeOpts.fill  = _normalizeFill(shapeOpts.fill);
        if (shapeOpts && shapeOpts.color) shapeOpts.color = _stripHash(shapeOpts.color);
        return _origAddShape(shapeOrType, shapeOpts);
    };

    return sld;
};

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
    // Stub require — LLM sometimes adds require() when trying to fix errors.
    // Return an empty object instead of crashing with "require is not defined".
    require: (mod) => {
        process.stderr.write(`[pptx_runner] require("${mod}") blocked in sandbox\n`);
        return {};
    },
});

// Syntax pre-check: compile only, no execution.
// exit(2) = syntax error (retryable by asking LLM to fix).
// exit(1) = runtime error (non-retryable or different fix needed).
try {
    new vm.Script(code);
} catch (err) {
    if (err instanceof SyntaxError) {
        console.error(`[pptx_runner] SyntaxError: ${err.message}`);
        process.exit(2);
    }
    // Non-SyntaxError during compilation — treat as runtime error
    console.error(`[pptx_runner] Compile error: ${err.message}`);
    process.exit(1);
}

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
