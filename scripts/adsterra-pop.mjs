#!/usr/bin/env node
/* Adsterra Popunder injector (2026-10-23). Run after the static build:
     node scripts/adsterra-pop.mjs <outDir>
   Reads scripts/adsterra-popunder.json {"popunderScriptUrl": "..."}.
   - Copies scripts/adsterra-runtime.js (shared runtime, 3 Pops per visitor
     per day) to <outDir>/adsterra/runtime.js, or to
     <outDir>/adsterra/pop-runtime.js when the site already serves a
     different runtime at that path.
   - Pages with an adsterra-config block: enablePopunder=true + URL.
   - Pages without one: adds a Popunder-only config (slots: []) and the
     runtime script before </body>.
   - Skips legal/policy pages, 404 pages, and pages without ads. Never adds Social Bar or slots. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || "out");
const { popunderScriptUrl } = JSON.parse(fs.readFileSync(path.join(here, "adsterra-popunder.json"), "utf8"));
if (!/^https:\/\/abscloud\.org\/1\/[0-9a-f]{32}$/.test(popunderScriptUrl)) throw new Error("bad popunderScriptUrl");
const runtime = fs.readFileSync(path.join(here, "adsterra-runtime.js"));
const CLEAN = new Set(["about","accessibility","advertising-policy","affiliate-disclosure","contact","cookie-policy","cookies","disclosure","dmca","editorial-policy","legal","privacy","sources","terms","corrections","editorial","methodology","404","_not-found","500"]);
const adDir = path.join(out, "adsterra");
fs.mkdirSync(adDir, { recursive: true });
const main = path.join(adDir, "runtime.js");
let rtPath = "/adsterra/runtime.js";
if (fs.existsSync(main) && !fs.readFileSync(main, "utf8").includes('getElementById("adsterra-config")')) {
  rtPath = "/adsterra/pop-runtime.js";
  fs.writeFileSync(path.join(adDir, "pop-runtime.js"), runtime);
} else {
  fs.writeFileSync(main, runtime);
}
const CFG_RE = /(<script[^>]*id="adsterra-config"[^>]*>)([\s\S]*?)(<\/script>)/;
let flipped = 0, added = 0, skipped = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!["_next","node_modules","_build","scripts","src","tests",".git",".vercel"].includes(e.name)) walk(p); continue; }
    if (!e.name.endsWith(".html")) continue;
    const rel = path.relative(out, p).split(path.sep);
    const segs = rel.map((s) => s.replace(/\.html$/, "").toLowerCase());
    if (segs.some((s) => CLEAN.has(s))) { skipped++; continue; }
    let html = fs.readFileSync(p, "utf8");
    const m = html.match(CFG_RE);
    if (m) {
      let cfg; try { cfg = JSON.parse(m[2]); } catch { skipped++; continue; }
      if (cfg.cleanPage) { skipped++; continue; }
      cfg.enablePopunder = true; cfg.popunderScriptUrl = popunderScriptUrl;
      html = html.replace(CFG_RE, (_a, o, _b, c) => o + JSON.stringify(cfg) + c);
      if (!html.includes('src="/adsterra/runtime.js"')) html = html.replace(/<\/body>(?![\s\S]*<\/body>)/, `<script src="/adsterra/runtime.js" defer></script></body>`);
      flipped++;
    } else {
      if (!/<\/body>/.test(html)) { skipped++; continue; }
      /* Only pages that already carry Adsterra ads get the Popunder. */
      if (process.env.ADSTERRA_POP_ALL !== "1" && !/atOptions|data-ad-host|ad-placement|adsterra|bauval\.org|effectivegate|profitableratecpm|highperformanceformat/i.test(html)) { skipped++; continue; }
      const cfg = { adNetwork: "adsterra", status: "ready", cleanPage: false, slots: [], enablePopunder: true, enableSocialBar: false, popunderScriptUrl, socialBarScriptUrl: "" };
      const tag = `<script type="application/json" id="adsterra-config">${JSON.stringify(cfg)}</script><script src="${rtPath}" defer></script>`;
      html = html.replace(/<\/body>(?![\s\S]*<\/body>)/, tag + "</body>");
      added++;
    }
    fs.writeFileSync(p, html);
  }
}
walk(out);
console.log(`adsterra-pop: runtime=${rtPath} flipped=${flipped} added=${added} skipped=${skipped}`);
