---
date: 2026-01-27
summary: Added unit test suite with Vitest for critical parsing and rate limiting logic
tags: [testing, vitest, api]
---

## Summary

Implemented a comprehensive unit test suite using Vitest, focusing on the most critical and testable parts of the application: Claude response parsing, rate limiting, and API error handling.

## Changes

- `package.json` - Added vitest dependency and test scripts (`test`, `test:watch`, `test:coverage`)
- `api/analyze.js` - Refactored for testability:
  - Extracted `parseClaudeResponse()` function from `analyzeWithClaude()`
  - Exported internal functions: `checkRateLimit`, `incrementRateLimit`, `formatTimeRemaining`
  - Added test helpers `_setRateLimitMap` and `_getRateLimitMap` for testing
- `js/api.js` - Exported `handleErrorResponse` for testing
- `tests/api/analyze.test.js` - 21 tests covering:
  - Claude response parsing (7 tests)
  - Rate limiting (9 tests)
  - Time formatting (5 tests)
- `tests/js/api.test.js` - 10 tests covering:
  - Error type mapping (7 tests)
  - APIError class (2 tests)
  - ErrorType constants (1 test)
- `tests/fixtures/claude-responses.json` - Test fixtures for Claude response parsing
- `README.md` - Added Testing section
- `CLAUDE.md` - Added test requirement to guidelines

## Decisions

- **Focused on critical paths**: Prioritized testing Claude response parsing (safety-critical), rate limiting (abuse prevention), and error handling over DOM manipulation or external API calls
- **Extracted parseClaudeResponse**: This function determines what verdict users see and is the most important logic to test
- **Test helpers for rate limiting**: Added `_setRateLimitMap` and `_getRateLimitMap` to allow tests to inject state without exposing the actual Map publicly

## Notes

- Total: 31 tests, all passing
- Test coverage focuses on pure functions that don't require mocking external APIs
- DOM manipulation tests (ui.js) and external API tests (Vision/Claude) deferred per plan
