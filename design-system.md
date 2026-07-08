# TeamYou — Design System

Source of truth: **[`tokens/design-tokens.json`](tokens/design-tokens.json)** (W3C Design
Tokens format, resolved values) and **[`src/tokens.css`](src/tokens.css)** (the same
tokens as CSS custom properties, Light + Dark). Both are generated from the Figma
export at `design/tokens.figma.json` via `npm run tokens` — **do not hand-edit the
generated files.** Two tiers: primitives → semantic aliases.

Typeface: **Inter** (UI) and **Roboto Mono** (code).

---

## Color — semantic roles

Use semantic tokens, not raw primitives. Four groups, each with role variants
(`bold`, `subtle`, `weak`, `disabled`, `brand`, `success`, `danger`, `warning`,
`info`, `accent-*`, plus interaction states `-hover` / `-active` / `-subtlest`).

| Group | CSS var prefix | JSON path | Use for |
|---|---|---|---|
| Text | `--text-*` | `color.text.*` | Text fills |
| Background | `--bg-*` | `color.bg.*` | Surfaces, fills |
| Icon | `--icon-*` | `color.icon.*` | Icon/stroke fills |
| Border | `--border-*` | `color.border.*` | Strokes, dividers |

Key values (Light):
- `--text-bold` `#171412` · `--text-subtle` `#59524d` · `--text-weak` `#69615c` · `--text-disabled` `#a8a29e`
- `--bg-surface` `#ffffff` · `--bg-surface-light` `#fafaf9` · `--bg-surface-base` `#ebeef0`
- `--bg-brand` `#1570ef` · `--icon-success` `#27bb36` · `--bg-accent-red` `#d92d20`
- `--border-subtle` `#e7e5e4` · `--border-default` `#d6d3d1` · `--border-brand` `#1570ef`

Primitive palette (only when no semantic token fits): `color.palette.<family>.<shade>`
— families gray/blue/green/orange/red/indigo/teal/neutral, shades 0–1400.

Inverse surfaces (solid "black" buttons/bubbles): background `--bg-gray-bold` with
text/icons `--text-inverse` — these invert correctly per theme.

---

## Spacing

`--space-*` / `space.*`. Scale (px): **XS 8 · S 12 · S-M 14 · M 16 · M-L 20 · L 24 · XL 32 · XXL 40 · XXXL 52**.
Always reference by name (e.g. `padding: var(--space-l)`), never hardcode px.

Page layout: content is inset **100px** on the left (`--page-pad-left`); header uses
`--space-l` top/right.

## Radius

`--radius-*` / `radius.*` (px): **XS 2 · S 4 · MS 6 · M 8 · L 16 · ring 12 · round 100**.

## Icon sizes

`--icon-size-*` / `iconSize.*` (px): **XS 16 · SM 20 · M 24 · L 32 · XL 52**.

---

## Typography

Family `--font-sans` (Inter), `--font-mono` (Roboto Mono).
Weights `--weight-*`: regular 400 · medium 500 · semibold 600 · bold 700.
Sizes `--font-size-*` / `fontSize.*` (px): 50→11 · 75→12 · 85→13 · 100→14 · 200→16 · 300→18 · 400→20 · 500→23 · 600→25 · 700→28 · 800→32 · 900→36 · 1000→40 …

Text styles (from the Figma text styles):
- **Heading**: XXL 56 · XL 36 · L 25 · **M 23** · MS 20 · S 18 · XS 16 — all Inter 700, line-height 1.2.
- **Body** L 16 / M 14 / S 13 / XS 12 — Regular 400 / Medium 500 / Strong 700, line-height 1.4.
- **Label** M 14 / S 13 / XS 12. **Code** L 18 / M 16 / S 12 (Roboto Mono).

Example: the editor title "New…" is **Heading M** (23/700) in `--text-disabled`.

---

## Shadows

From the Figma effect styles:
- `--shadow-framed-minimal` — `0 1px 3px 0 rgba(0,0,0,.08)` (header divider, subtle frames).
- Raised 1 `0 2px 4px rgba(0,0,0,.08)` · Raised 2 `0 8px 16px rgba(0,0,0,.12)` · Overlay `0 8px 32px rgba(0,0,0,.16)`.

The shell is a **full-screen editor** — no inline modal, no card drop-shadow.

---

## Theming

`src/tokens.css` ships Light + Dark. Dark applies via `:root[data-theme="dark"]`
or the OS preference. **Note:** the current Figma export's Dark values are not yet
a true dark theme (dark surfaces resolve to light), so the app is pinned to Light
(`<html data-theme="light">`). Once real dark values are exported, remove that pin.

## Regenerating

```
npm run tokens   # Figma export → src/tokens.css + tokens/design-tokens.json
```
