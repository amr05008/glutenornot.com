# docs

Reference material that is not shipped with any deployable.

## How a scan works (drawn 2026-09-16 for the overview video)

Two versions of the same pipeline, each as a self-contained SVG (fonts embedded, so GitHub renders it as-is) plus a 2x PNG for video editing. Light and `-dark` variants of each.

- `how-it-works-simple.svg` / `.png` — **the video version.** Four steps (scan → read → check → answer), the two roads in, the no-match-take-a-photo loop, the three verdicts. About 40 words; the narration carries the detail.
- `how-it-works.svg` / `.png` — **the engineering version.** Same flow with the barcode lookup waterfall, the Jev fast path on Open Food Facts barcodes (decision 007), the API boundary, the Claude prompt rules, and the safe-verdict floor (too little text, or a cut-off ingredient list).
