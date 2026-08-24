// Pull icon components from Figma as exact SVGs → src/icons/.
// Reads FIGMA_TOKEN from .env.figma. Run: node scripts/figma-pull.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "icons");
const KEY = "fQ554nti4zAIeWMh15cXMz";

const TOKEN = fs
  .readFileSync(path.join(ROOT, ".env.figma"), "utf8")
  .split("=", 2)[1]
  .trim();

// name (kebab) → Figma node id. 24px variants where sizes exist.
const ICONS = {
  "chevron-down": "9003:1756",
  "arrow-forward": "8950:3402",
  "arrow-down": "9103:1782",
  signpost: "9006:1793",
  rocket: "9129:2154",
  "notes-pencil": "9129:2096",
  receipt: "9058:1825",
  "doc-checkmark": "9127:2378",
  "contact-record": "9058:1777",
  "missing-data": "9058:1790",
  missing: "9056:51784",
  "calendar-noshow": "9058:1801",
  vip: "9048:1881",
  checklist: "9030:1834",
  rules: "9105:1857",
  "ai-robot": "9026:1886",
  "chevron-forward": "20:53",
  shield: "8557:6837",
  "alt-path": "9105:1978",
  checkmark: "9124:2001",
  lock: "9127:2366",
  refresh: "9127:2361",
  "spec-check": "9151:3695",
  "active-chat": "9154:2218",
  close: "9171:3152",
  "badge-notification": "8998:2234",
  "progress-indicator-28": "9124:2023",
  "progress-priority": "8950:3390",
  "progress-completed": "8950:3399",
  "progress-uncompleted": "8950:3393",
  "composer-attach": "9141:2617",
  "composer-mic": "9141:2620",
  send: "9141:2623",
  // Today-screen nav icons (Header 9132:2104)
  "nav-today": "9132:2106",
  "nav-work-feed": "9132:2112",
  "nav-projects": "9132:2115",
  "nav-insights": "9132:2118",
  // add (9164:2895) pulled once, then hand-tuned to stroke=currentColor so the
  // "+ New spec" glyph inherits its button color. Re-add here only to re-pull.
};

const headers = { "X-Figma-Token": TOKEN };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const ids = Object.values(ICONS).join(",");

  // 1. Ask Figma to render each node as SVG → returns { images: { id: url } }
  const res = await fetch(
    `https://api.figma.com/v1/images/${KEY}?ids=${encodeURIComponent(ids)}&format=svg&svg_outline_text=false`,
    { headers },
  );
  const data = await res.json();
  if (data.err) throw new Error("Figma images error: " + JSON.stringify(data));

  // 2. Download each SVG to src/icons/<name>.svg
  let ok = 0;
  const missing = [];
  for (const [name, id] of Object.entries(ICONS)) {
    const url = data.images[id];
    if (!url) {
      missing.push(name);
      continue;
    }
    const svg = await (await fetch(url)).text();
    fs.writeFileSync(path.join(OUT, `${name}.svg`), svg.trim() + "\n");
    ok++;
  }

  console.log(`Wrote ${ok} icons → ${path.relative(ROOT, OUT)}/`);
  if (missing.length) console.log("Missing (no render):", missing.join(", "));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
