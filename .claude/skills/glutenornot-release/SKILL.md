---
name: glutenornot-release
description: Use when shipping, building, or submitting a new iOS version of GlutenOrNot — "ship 1.2.1", "cut an iOS release", "get a build to App Store Connect / TestFlight" — or asks about the iOS release process. NOT for web/API changes (Vercel auto-deploys from main; nothing to release) and NOT for plain git tagging in other repos (use the release skill).
---

# GlutenOrNot iOS Release

**The runbook is `mobile/RELEASE.md` in `~/repos/glutenornot.com` — read it FIRST and follow it exactly.** It is the single source of truth (steps, quirks, troubleshooting) and this skill deliberately does not duplicate it. The abbreviated "iOS Build" section in the repo's CLAUDE.md is a summary, not the process — it omits the version-lockstep bump, the Sentry token step, the smoke test, and the entire close-out.

## Routing

| Ask | Path |
|---|---|
| iOS release / build / TestFlight / App Store | This skill → `mobile/RELEASE.md` |
| Web or API change "release" | Nothing to do — Vercel deploys `main` continuously |
| Generic "tag a release" in another repo | `release` skill, not this one |

## Division of labor

Claude does everything scriptable: preflight (`tsc`, jest, clean `main`), the 4-file version lockstep bump, prebuild + the two post-prebuild patches (MARKETING_VERSION, `sentry.properties`), git tag, doc close-out. **The human does the GUI steps**: Xcode archive + upload (runbook step 5) and App Store Connect metadata + submit (step 6) — hand these off explicitly with the runbook's checklist, including the known-benign "Upload Symbols Failed" note.

## Close-out (part of the release, not optional)

After submission: update `mobile/RELEASE.md`'s "Last shipped" header, write the session log + index entry, tag `vX.Y.Z` (runbook step 7), and record the post-release watch items (Sentry `glutenornot-mobile`, PostHog `scan` platform attribution). If reality diverged from the runbook at any step, fix the runbook in the same commit — that's how it stays trustworthy.
