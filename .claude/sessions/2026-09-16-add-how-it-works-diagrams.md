---
date: 2026-09-16
summary: Drew the scan pipeline for the "how it works" beat of Aaron's overview video — a private artifact first, then two standalone SVGs in a new `docs/` folder (a 4-step video version and the full engineering version, light + dark, with 2x PNGs); shipped from a worktree because the main checkout was mid-way through another session's oats work; PR #28 merged
tags: [docs, diagram, video, design-system]
---

## Summary

Aaron is filming an overview video of the app for a mixed technical / non-technical audience and wanted a diagram for the "how it works" section. First cut was an engineering-grade drawing (waterfall, API boundary, six prompt rules, safe floor); on the audience question I said it was too dense for narration and he asked for a simple one. Both now live in `docs/` as self-contained SVGs so the repo, not a shared artifact, is the home.

## Changes

- `docs/how-it-works-simple.svg` / `-dark.svg` / `.png` / `-dark.png` — the video version: scan → read → check → answer, the two roads in, the no-match-take-a-photo loop, three verdict bands, "stays on your phone". ~40 words.
- `docs/how-it-works.svg` / `-dark.svg` / `.png` / `-dark.png` — the engineering version: lookup waterfall, OCR, the Claude rules, the safe floor, Recents.
- `docs/README.md` — which is which.
- `README.md` (How It Works embeds the simple SVG; links the detailed one), `CLAUDE.md` (Quick Reference pointer + "a pipeline change changes the drawing").

Commits: `abffe6b` diagrams · `eab3abf` merge PR #28 · (this wrap-up, direct to main like previous closeouts)

## Decisions

- **Two versions, not one.** The video figure carries the shape (two roads in, one analyzer, one answer) and the narration carries the detail. Vendor and model names, the six prompt rules and the safe-floor gate stay on the engineering version only.
- **Standalone SVG with embedded fonts** rather than the HTML artifact: GitHub renders SVG inline (file view and README) but an HTML file only as source; Hanken Grotesk + JetBrains Mono are embedded as data URIs (the two variable woff2 files from Google Fonts, ~57 KB) because GitHub's SVG sandbox loads no external resources. Light and dark are separate files since a file has no viewer theme to follow. PNGs are 2x renders (Chromium via Playwright, `<img>` at 3200 px wide).
- **Ship from a `git worktree` off main.** When `/ship` ran, the main checkout had been switched to `oats-gf-claim-2026-09-16` by another session with eight modified files uncommitted. `git worktree add … -b <branch> main`, `mv docs/` into it, commit, push, PR — the other session's tree was never touched. Aaron endorsed this over committing onto the oats branch.
- **The detailed diagram's oats line is ahead of main.** It reads "Oats → caution unless labeled GF" (decision 004, landing on the oats branch) rather than main's "unless certified", so the drawing does not need a second edit when that merges.
- **Docs-only PR merged on Aaron's word without a second-agent review** ("skip to merge").

## Notes

- Private artifact (detailed version only, with a theme toggle): https://claude.ai/artifact/H5WDYgfK3uK9QEj4DvGpSf — not shared; the repo files are canonical.
- To edit a diagram: the shapes and text are plain XML after the `<style>` block in each SVG; change light and `-dark` together and re-render the PNGs from a browser (a local `python3 -m http.server` + an `<img>` wrapper at 2x worked; `file://` is blocked in the Playwright plugin, and its screenshots must land inside the repo).
- The pasted beat sheet never reached me (only a "[Pasted text]" placeholder), so the figure follows the real pipeline rather than the beats. Worth re-checking against the sheet before filming.
- A rendering gotcha for the design tokens: a `.on-dark` fill class must come after every text-size class in the cascade or the phone's title renders ink-on-ink. Bit me once on the simple version.
