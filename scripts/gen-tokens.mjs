// Generate src/tokens.css from the Figma variables export
// (design/tokens.figma.json). Run with: npm run tokens
//
// Two tiers: color primitives + semantic aliases (Text/Bg/Icon/Border), plus
// spacing, radius, icon sizes, and typography. Light + Dark modes. Every
// semantic token is resolved to a concrete hex (handles cross-mode refs and
// the messy Figma names).

import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "design", "tokens.figma.json");
const OUT = path.join(ROOT, "src", "tokens.css");

const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
const coll = (name) => data.find((c) => Object.keys(c)[0] === name)[name];

const kebab = (s) =>
  s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ── Primitive color lookup: prim[Mode][familyKebab][shade] = hex ──
const primRoot = coll("Color Primitive").modes.Value; // { Light: {...}, Dark: {...} }
const prim = {};
for (const mode of Object.keys(primRoot)) {
  prim[mode] = {};
  for (const family of Object.keys(primRoot[mode])) {
    const fk = kebab(family);
    prim[mode][fk] = {};
    for (const shade of Object.keys(primRoot[mode][family])) {
      const leaf = primRoot[mode][family][shade];
      if (leaf && typeof leaf.$value === "string") {
        prim[mode][fk][shade] = leaf.$value;
      }
    }
  }
}

const SEM_GROUPS = ["Text", "Bg", "Icon", "Border"];
const semantic = coll("Color").modes; // { Light: {Text,Bg,Icon,Border}, Dark: {...} }

const unresolved = [];

function hexInStr(s) {
  const m = s.match(/([0-9a-fA-F]{6})\b/);
  return m ? "#" + m[1].toLowerCase() : null;
}

// Resolve a semantic token's $value (hex or {ref}) to concrete hex.
function resolve(value, mode, depth = 0) {
  if (depth > 6) return null;
  if (typeof value !== "string") return null;
  if (value.startsWith("#")) return value.toLowerCase();

  if (!value.includes("{")) {
    return hexInStr(value);
  }

  const raw = value.replace(/[{}]/g, "").trim();
  const parts = raw.split(".").map((p) => p.trim());

  // Intra-collection semantic reference, e.g. {Icon.Inverse}
  if (SEM_GROUPS.includes(parts[0]) && parts[1]) {
    const node = semantic[mode]?.[parts[0]]?.[parts[1]];
    if (node) return resolve(node.$value, mode, depth + 1);
  }

  // Embedded hex in a messy name, e.g. {Light.Gray.200 - EBEEF0}
  const embedded = hexInStr(raw);
  if (embedded) return embedded;

  // Primitive reference
  let m = mode;
  let familyRaw, shade;
  if (parts[0] === "Light" || parts[0] === "Dark") {
    m = parts[0];
    familyRaw = parts[1];
    shade = parts[2];
  } else {
    familyRaw = parts[0];
    shade = parts[1];
  }
  if (!familyRaw || shade == null) {
    unresolved.push(`${value} (mode ${mode})`);
    return null;
  }
  // Family candidates: full name first (e.g. "neutral-blue", "gray-warm"),
  // then a dash-suffix-stripped fallback, then gray-warm → gray.
  const full = kebab(familyRaw);
  const stripped = kebab(familyRaw.replace(/\s*-\s*\S*$/, ""));
  const familyCands = [
    ...new Set([full, stripped, full.startsWith("gray-warm") ? "gray" : null]),
  ].filter(Boolean);
  const shadeClean = shade.replace(/[^0-9]/g, "") || shade;
  const shadeCands = [...new Set([shade, shadeClean])];

  const tryModes = [m, m === "Light" ? "Dark" : "Light"];
  for (const mm of tryModes) {
    for (const fc of familyCands) {
      for (const sc of shadeCands) {
        const hit = prim[mm]?.[fc]?.[sc];
        if (hit) return hit.toLowerCase();
      }
    }
  }
  unresolved.push(`${value} → family="${full}" shade="${shadeClean}" (mode ${mode})`);
  return null;
}

// Semantic var name: group + token, e.g. --bg-brand-hover
const varName = (group, token) => `--${kebab(group)}-${kebab(token)}`;

function emitSemantic(mode) {
  const lines = [];
  for (const group of SEM_GROUPS) {
    const g = semantic[mode][group];
    for (const token of Object.keys(g)) {
      const leaf = g[token];
      if (!leaf || leaf.$type !== "color") continue;
      const hex = resolve(leaf.$value, mode);
      if (hex) lines.push(`  ${varName(group, token)}: ${hex};`);
    }
  }
  return lines;
}

function emitPrimitives(mode) {
  const lines = [];
  for (const family of Object.keys(prim[mode])) {
    for (const shade of Object.keys(prim[mode][family])) {
      // Sanitize shade to a valid CSS identifier ("800 2" → "800-2").
      lines.push(`  --${family}-${kebab(shade)}: ${prim[mode][family][shade].toLowerCase()};`);
    }
  }
  return lines;
}

// ── Numbers (spacing / radius / icon sizes) ──
const numbers = coll("Numbers").modes["Mode 1"];
const numLines = [];
const numPrefix = { Space: "space", Corner: "radius", Icon: "icon-size" };
for (const group of Object.keys(numbers)) {
  const pfx = numPrefix[group] ?? kebab(group);
  for (const key of Object.keys(numbers[group])) {
    const leaf = numbers[group][key];
    if (leaf && leaf.$type === "float") {
      numLines.push(`  --${pfx}-${kebab(key)}: ${leaf.$value}px;`);
    }
  }
}

// ── Typography primitives (font family / weight / sizes) ──
const typo = coll("Typography Primitives").modes.Value;
const typoLines = [];
const typoPrefix = {
  "Font Family": "font",
  Weight: "weight",
  "Size Desktop": "font-size",
  "Size Mobile": "font-size-mobile",
};
for (const group of Object.keys(typo)) {
  const pfx = typoPrefix[group] ?? kebab(group);
  for (const key of Object.keys(typo[group])) {
    const leaf = typo[group][key];
    if (!leaf || leaf.$value == null) continue;
    let v = leaf.$value;
    if (group.startsWith("Size")) v = `${v}px`;
    else if (group === "Font Family")
      v = `"${v}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    typoLines.push(`  --${pfx}-${kebab(key)}: ${v};`);
  }
}

// ── Assemble ──
const header = `/*
 * Design tokens — generated from design/tokens.figma.json (Untitled UI export).
 * Two tiers: color primitives + semantic aliases (Text/Bg/Icon/Border), plus
 * spacing, radius, icon sizes, and typography. Light + Dark modes.
 *
 * DO NOT EDIT BY HAND — regenerate with:  npm run tokens
 */`;

const out = `${header}

:root {
  /* ── Color primitives (Light) ── */
${emitPrimitives("Light").join("\n")}

  /* ── Semantic color (Light) ── */
${emitSemantic("Light").join("\n")}

  /* ── Spacing / radius / icon sizes ── */
${numLines.join("\n")}

  /* ── Typography ── */
${typoLines.join("\n")}
}

/* Dark mode: explicit opt-in wins, else follow the OS preference. */
:root[data-theme="dark"] {
  /* ── Color primitives (Dark) ── */
${emitPrimitives("Dark").join("\n")}

  /* ── Semantic color (Dark) ── */
${emitSemantic("Dark").join("\n")}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${emitPrimitives("Dark").map((l) => "  " + l).join("\n")}

${emitSemantic("Dark").map((l) => "  " + l).join("\n")}
  }
}
`;

fs.writeFileSync(OUT, out);
console.log("Wrote", path.relative(ROOT, OUT));

// ── Also emit W3C Design Tokens JSON (for Claude Design / other tools) ──
// Resolved Light-mode values, so there is no {ref} indirection to resolve.
const OUT_JSON = path.join(ROOT, "tokens", "design-tokens.json");
const groupKey = { Text: "text", Bg: "bg", Icon: "icon", Border: "border" };

const dt = {
  color: { text: {}, bg: {}, icon: {}, border: {}, palette: {} },
  space: {},
  radius: {},
  iconSize: {},
  fontFamily: {},
  fontWeight: {},
  fontSize: {},
};

// Semantic colors (resolved hex)
for (const group of SEM_GROUPS) {
  for (const token of Object.keys(semantic.Light[group])) {
    const leaf = semantic.Light[group][token];
    if (!leaf || leaf.$type !== "color") continue;
    const hex = resolve(leaf.$value, "Light");
    if (hex) dt.color[groupKey[group]][kebab(token)] = { $type: "color", $value: hex };
  }
}

// Primitive palette
for (const family of Object.keys(prim.Light)) {
  dt.color.palette[family] = {};
  for (const shade of Object.keys(prim.Light[family])) {
    dt.color.palette[family][kebab(shade)] = {
      $type: "color",
      $value: prim.Light[family][shade].toLowerCase(),
    };
  }
}

// Dimensions
for (const group of Object.keys(numbers)) {
  const bucket = group === "Space" ? dt.space : group === "Corner" ? dt.radius : dt.iconSize;
  for (const key of Object.keys(numbers[group])) {
    const leaf = numbers[group][key];
    if (leaf && leaf.$type === "float") {
      bucket[kebab(key)] = { $type: "dimension", $value: `${leaf.$value}px` };
    }
  }
}

// Typography
for (const group of Object.keys(typo)) {
  for (const key of Object.keys(typo[group])) {
    const leaf = typo[group][key];
    if (!leaf || leaf.$value == null) continue;
    const k = kebab(key);
    if (group === "Font Family")
      dt.fontFamily[k] = { $type: "fontFamily", $value: leaf.$value };
    else if (group === "Weight")
      dt.fontWeight[k] = { $type: "fontWeight", $value: leaf.$value };
    else if (group === "Size Desktop")
      dt.fontSize[k] = { $type: "dimension", $value: `${leaf.$value}px` };
  }
}

fs.mkdirSync(path.join(ROOT, "tokens"), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(dt, null, 2) + "\n");
console.log("Wrote", path.relative(ROOT, OUT_JSON));

console.log(
  `Semantic: ${emitSemantic("Light").length} · Primitives: ${emitPrimitives("Light").length} · Numbers: ${numLines.length} · Typography: ${typoLines.length}`,
);
console.log("Unresolved refs:", unresolved.length);
if (unresolved.length) console.log([...new Set(unresolved)].join("\n"));
