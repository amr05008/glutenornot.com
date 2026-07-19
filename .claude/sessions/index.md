# Session Index

Quick lookup for Claude Code working sessions.

| Date | Session | Summary |
|------|---------|---------|
| 2026-01-26 | [add-mvp-implementation](./2026-01-26-add-mvp-implementation.md) | Initial MVP implementation of the PWA |
| 2026-01-27 | [setup-local-dev](./2026-01-27-setup-local-dev.md) | Configured local dev with Vercel CLI, tested E2E |
| 2026-01-27 | [add-unit-tests](./2026-01-27-add-unit-tests.md) | Added Vitest test suite for critical logic (31 tests) |
| 2026-01-27 | [add-trust-messaging](./2026-01-27-add-trust-messaging.md) | Added "Free Forever" trust messaging to main screen |
| 2026-01-27 | [plan-improvement-roadmap](./2026-01-27-plan-improvement-roadmap.md) | Created comprehensive improvement roadmap for PWA |
| 2026-01-31 | [add-lifetime-counter](./2026-01-31-add-lifetime-counter.md) | Converted daily scan counter to persistent lifetime counter (web + mobile) |
| 2026-01-31 | [add-friendlier-output-messages](./2026-01-31-add-friendlier-output-messages.md) | Added friendlier headlines and warmer Claude explanations |
| 2026-02-01 | [add-app-store-submission-guide](./2026-02-01-add-app-store-submission-guide.md) | Created App Store submission reference document |
| 2026-02-01 | [rebrand-teal-theme](./2026-02-01-rebrand-teal-theme.md) | Rebranded web and mobile apps to teal color scheme |
| 2026-02-01 | [fix-testflight-xcode-setup](./2026-02-01-fix-testflight-xcode-setup.md) | Resolved Xcode signing/build issues for TestFlight |
| 2026-02-02 | [add-accessibility-labels](./2026-02-02-add-accessibility-labels.md) | Added VoiceOver accessibility labels for App Store compliance |
| 2026-02-02 | [submit-app-store](./2026-02-02-submit-app-store.md) | Submitted iOS app to App Store for review |
| 2026-02-04 | [add-sentry-crash-reporting](./2026-02-04-add-sentry-crash-reporting.md) | Integrated Sentry crash reporting into mobile app |
| 2026-02-04 | [fix-background-scan-hang](./2026-02-04-fix-background-scan-hang.md) | Fix mobile app hanging on scan after prolonged background inactivity |
| 2026-02-05 | [fix-camera-ready-crash](./2026-02-05-fix-camera-ready-crash.md) | Fix fatal crash when capturing photo before camera session is ready |
| 2026-02-05 | [build-v1.0.1-release](./2026-02-05-build-v1.0.1-release.md) | Build and submit v1.0.1 production release to App Store |
| 2026-02-05 | [fix-camera-button-disabled](./2026-02-05-fix-camera-button-disabled.md) | Fix camera button permanently disabled in TestFlight 1.0.1 |
| 2026-02-05 | [fix-cancel-timeout-error](./2026-02-05-fix-cancel-timeout-error.md) | Fix Cancel button incorrectly showing "Request timed out" error |
| 2026-02-05 | [switch-local-xcode-builds](./2026-02-05-switch-local-xcode-builds.md) | Switch to local Xcode builds, bump version to 1.0.2 |
| 2026-02-15 | [fix-ocr-error-handling](./2026-02-15-fix-ocr-error-handling.md) | Handle OCR failures with inline banner instead of alert popup |
| 2026-02-16 | [increase-slow-scan-threshold](./2026-02-16-increase-slow-scan-threshold.md) | Increase slow scan threshold from 10s to 30s |
| 2026-02-16 | [fix-menu-mode-display](./2026-02-16-fix-menu-mode-display.md) | Fix menu items not displaying due to capitalized mode from Claude |
| 2026-03-01 | [build-v1.1.0-release](./2026-03-01-build-v1.1.0-release.md) | Build and distribute v1.1.0 to App Store Connect |
| 2026-04-14 | [sentry-audit-and-fixes](./2026-04-14-sentry-audit-and-fixes.md) | Sentry audit: root cause GLUTENORNOT-MOBILE-2, beforeSend filter, barcode miss logging, duplicate scan cache |
| 2026-04-14 | [build-v1.1.1-release](./2026-04-14-build-v1.1.1-release.md) | Build and submit v1.1.1 production release to App Store |
| 2026-04-20 | [expand-multilingual-prompt](./2026-04-20-expand-multilingual-prompt.md) | Added Dutch + Catalan vocabulary and traveler-context rule to the Claude prompt (Amsterdam/Barcelona prep) |
| 2026-06-01 | [fix-ocr-sentry-noise](./2026-06-01-fix-ocr-sentry-noise.md) | Suppress ocr_failed Sentry noise (wrapper + beforeSend); resolve MOBILE-2 |
| 2026-06-06 | [implement-v2-redesign](./2026-06-06-implement-v2-redesign.md) | Implemented "Direction A · Clinic" V2 redesign across web + iOS (tokens, fonts, SVG marks, screens); presentation-only |
| 2026-06-06 | [fix-sw-cache-platform](./2026-06-06-fix-sw-cache-platform.md) | Fixed stale SW cache so web scans report platform; verified PostHog analytics; added platform-breakdown dashboard insight |
| 2026-06-06 | [merge-posthog-analytics](./2026-06-06-merge-posthog-analytics.md) | Reviewed + merged PostHog scan-event analytics (PR #13); reconciled CLAUDE.md/README/RELEASE docs |
| 2026-06-06 | [build-v1.2.0-release](./2026-06-06-build-v1.2.0-release.md) | Built + submitted iOS v1.2.0 (V2 redesign) to App Store review; first M3 build, cleared 4 build-env issues; updated runbook/ROADMAP/README |
| 2026-06-07 | [fix-result-band-void](./2026-06-07-fix-result-band-void.md) | Full-bleed iOS verdict band + floating close X so titleless scans have no empty top void; needs new build to ship |
| 2026-06-07 | [fix-barcode-gluten-tag-trust](./2026-06-07-fix-barcode-gluten-tag-trust.md) | Stop barcode scans returning false Unsafe on uncorroborated OFF gluten allergen tags (KIND 602652171826); added assessGlutenSignal + prompt reliability section; server-side, no new build |
| 2026-06-18 | [fix-retired-model-add-health-monitoring](./2026-06-18-fix-retired-model-add-health-monitoring.md) | Fixed 503 outage from retired Claude model (→ claude-sonnet-4-6); added deep health canary + UptimeRobot→Discord monitor + Sentry alert so the next break alerts within minutes |
| 2026-06-18 | [add-dashboard-active-user-metrics](./2026-06-18-add-dashboard-active-user-metrics.md) | Built scan-based WAU + total-scans + method/mode tiles on PostHog dashboard, retargeted Retention/Growth from $pageview to scan; audited for gaps (PostHog-only, no repo changes) |
| 2026-07-06 | [add-scan-failure-analytics-and-barcode-timeouts](./2026-07-06-add-scan-failure-analytics-and-barcode-timeouts.md) | Backend observability batch: 5s per-source barcode lookup timeouts (fixes MOBILE-7), scan_failed PostHog event, confidence/had_ingredient_data scan properties, fallback-key report in /api/health |
| 2026-07-06 | [add-recents-rating-french](./2026-07-06-add-recents-rating-french.md) | Recents scan history (local-only, cap 50) + in-app rating prompt + French glossary; /grill forced privacy-policy rewrite (Anonymous Analytics section, PostHog/Sentry disclosure) |
| 2026-07-07 | [release-ios-1.3.0](./2026-07-07-release-ios-1.3.0.md) | Built + submitted iOS v1.3.0 (Recents, rating prompt, result-band fix); runbook updated (Release-config smoke, ~/.sentryclirc token, 40-test count); tagged v1.3.0 |
| 2026-07-11 | [merge-pr15-arm-sentry-tripwire](./2026-07-11-merge-pr15-arm-sentry-tripwire.md) | Grilled + merged PR #15 (pre-flight connectivity check, expo-network); release deferred to next build (never eas update at 1.3.0); resolved Sentry MOBILE-7/-2 to arm regression-email tripwire for connectivity failures |
| 2026-07-18 | [add-release-skill-to-repo](./2026-07-18-add-release-skill-to-repo.md) | Audited both glutenornot skills for public release; moved glutenornot-release here from the private claude-channels repo (now symlinked back), left glutenornot-debug private; logged an open privacy-policy wording tension |
| 2026-07-18 | [add-barcode-fallback-and-ocr-instrumentation](./2026-07-18-add-barcode-fallback-and-ocr-instrumentation.md) | Weekly data review → UPCitemdb barcode fallback (PR #16) + image_kb/ocr_chars OCR instrumentation (PR #17); two /grill cycles (barcode-privacy veto, fork-criterion tautology); 1.4.0 scoped in plans/ocr-capture-assist |
