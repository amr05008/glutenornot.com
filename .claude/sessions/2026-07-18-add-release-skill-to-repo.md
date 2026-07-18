---
date: 2026-07-18
summary: Audited the two GlutenOrNot skills for public release; moved glutenornot-release into this repo
tags: [skills, docs, privacy]
---

## Summary

Audited `glutenornot-release` and `glutenornot-debug` for whether they could be
made public and live in this repo (goal: reference one from a blog post on
aaronroy.com). Moved `glutenornot-release` here and made it the source of
truth; left `glutenornot-debug` where it was.

## Changes

- `.claude/skills/glutenornot-release/SKILL.md` — new; moved from the private
  `amr05008/claude-channels` repo. Two Aaron-specific phrasings genericized for
  a public audience. Commit `53e44bf`.
- `CLAUDE.md` — Quick Reference now points at `.claude/skills/`.
- `amr05008/claude-channels` (separate repo) — skill removed, commit `503d46a`.

## Decisions

**`glutenornot-release` is public, `glutenornot-debug` stays private.** The
release skill carries no secrets and delegates to the already-public
`mobile/RELEASE.md`. The debug skill carries home-lab machine topology
(`cos-m1` / `openclaw-pi` / the Discord hand-off), the `~10 total users`
figure, and single-user incident detail — none of it fit for a public repo.

**Source of truth moved rather than copied.** `~/.claude/skills/glutenornot-release`
is now a symlink into this repo, so the skill still loads globally on the Mac
without a second copy drifting. Note the fragility: re-cloning or moving this
checkout silently dangles that symlink.

## Notes

**Open item — privacy claim tension (not addressed this session).**
`web/privacy-policy.html:132` says scan events "cannot be linked back to you."
The `glutenornot-debug` skill documents `distinct_id` = SHA-256 of client IP
and a procedure for following one user by `distinct_id` + `$geoip_city_name`.
Both underlying facts are disclosed in the policy, but the "cannot be linked
back to you" phrasing is stronger than actual practice supports. Worth either
softening the policy line (e.g. "not linked to an account or identity") or
reframing the skill's wording. Independent of the publishing question.

**Near-miss worth remembering:** `~/.claude/skills/*` entries are symlinks into
`~/repos/claude-channels`. A plain `mv` of what looked like a global skill file
followed the symlink and deleted the source out of that repo; restored via
`git checkout` before anything was lost.
