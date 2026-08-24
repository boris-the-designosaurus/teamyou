// Dump a simplified tree (name, type, text, layout, fills, radius, padding) for
// a Figma node so we can build it in code. Usage: node scripts/figma-node.mjs <nodeId>
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "fQ554nti4zAIeWMh15cXMz";
const TOKEN = fs.readFileSync(path.join(ROOT, ".env.figma"), "utf8").split("=", 2)[1].trim();

const nodeId = process.argv[2] || "9217:2638";

function color(c) {
  if (!c) return null;
  const to = (x) => Math.round(x * 255);
  const a = c.a ?? 1;
  return a < 1 ? `rgba(${to(c.r)},${to(c.g)},${to(c.b)},${a.toFixed(2)})` : `#${[c.r, c.g, c.b].map((x) => to(x).toString(16).padStart(2, "0")).join("")}`;
}

function simplify(n, depth = 0) {
  if (!n) return null;
  const o = { name: n.name, type: n.type, id: n.id };
  if (n.characters) o.text = n.characters;
  if (n.style) o.font = `${n.style.fontFamily} ${n.style.fontWeight}/${n.style.fontSize} lh${n.style.lineHeightPx}`;
  const layout = [];
  if (n.layoutMode) layout.push(`${n.layoutMode}${n.itemSpacing != null ? " gap=" + n.itemSpacing : ""}`);
  if (n.paddingLeft != null || n.paddingTop != null)
    layout.push(`pad ${n.paddingTop || 0}/${n.paddingRight || 0}/${n.paddingBottom || 0}/${n.paddingLeft || 0}`);
  if (n.primaryAxisAlignItems) layout.push("main:" + n.primaryAxisAlignItems);
  if (n.counterAxisAlignItems) layout.push("cross:" + n.counterAxisAlignItems);
  if (layout.length) o.layout = layout.join(" | ");
  if (n.absoluteBoundingBox) o.size = `${Math.round(n.absoluteBoundingBox.width)}x${Math.round(n.absoluteBoundingBox.height)}`;
  if (Array.isArray(n.fills) && n.fills.length && n.fills[0].type === "SOLID") o.fill = color(n.fills[0].color);
  if (Array.isArray(n.strokes) && n.strokes.length) o.stroke = color(n.strokes[0].color) + ` ${n.strokeWeight || 1}px`;
  if (n.cornerRadius != null) o.radius = n.cornerRadius;
  if (n.rectangleCornerRadii) o.radius = n.rectangleCornerRadii.join(",");
  if (Array.isArray(n.effects) && n.effects.length) o.effects = n.effects.map((e) => `${e.type} ${color(e.color)} x${e.offset?.x || 0} y${e.offset?.y || 0} b${e.radius || 0}`).join("; ");
  if (n.children) o.children = n.children.map((c) => simplify(c, depth + 1));
  return o;
}

const res = await fetch(`https://api.figma.com/v1/files/${KEY}/nodes?ids=${encodeURIComponent(nodeId)}&depth=12`, {
  headers: { "X-Figma-Token": TOKEN },
});
const data = await res.json();
if (data.err) throw new Error(JSON.stringify(data));
const doc = data.nodes[nodeId]?.document;
if (!doc) throw new Error("Node not found: " + nodeId + " — keys: " + Object.keys(data.nodes).join(","));
const out = path.join(ROOT, "scripts", `node-${nodeId.replace(":", "_")}.json`);
fs.writeFileSync(out, JSON.stringify(simplify(doc), null, 2));
console.log("Wrote " + path.relative(ROOT, out));
