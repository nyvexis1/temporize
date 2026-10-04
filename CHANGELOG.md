# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.1] - 2026-10-04

### Fixed

- CommonJS consumers now receive CommonJS type declarations (`.d.cts`) through
  the `require` export condition instead of the ESM declarations, and the
  `react` and `vue` subpath types resolve under `node10` module resolution.
- The CommonJS React and Vue adapters now share the core error classes instead
  of bundling their own copies, so `instanceof TemporizeAbortError` works for
  errors raised by hooks and composables.
- Aborting the signal passed to `debounceAsync` now rejects overlap jobs queued
  behind active work instead of letting them start.
- `retry` now consults `shouldRetry` on the final attempt. A non-retryable error
  is always rethrown unwrapped instead of becoming `TemporizeTimeoutError` when
  it occurs on the last attempt or with `attempts: 1`.

### Changed

- `./package.json` is now exported.
- Releases now run publint, arethetypeswrong, and a duplicate error-class check
  before publishing.

## [0.4.0] - 2026-08-03

### Added

- `sample` for clock-driven latest-value snapshots without stale duplicate ticks.
- `once` for shared, resettable single invocations with rejection recovery.
- `timeout` for cooperative hard time budgets around async functions.
- `poll` for condition-based async polling with attempt, deadline, and abort limits.

## [0.3.1] - 2026-08-01

### Changed

- Corrected the MIT copyright notice to identify the author by their public
  pseudonym, `nyvexis_`.
- Added and packaged third-party notices for the development-only Lodash
  benchmark references. Lodash remains excluded from runtime dependencies and
  published bundles.

## [0.3.0] - 2026-08-01

### Added

- `concurrencyLimit` with FIFO queuing, cancellation, and live queue counters.
- `TemporizeAbortError` and `TemporizeTimeoutError` public error classes.
- Automated Node 18, 20, and 22 CI, including a per-export 1 kB gzip budget.
- ESLint, Prettier, contribution guidelines, and npm/build/size badges.

### Changed

- Abort-driven rejections now consistently use `TemporizeAbortError` and retain
  the original `AbortSignal.reason`.
- Exhausted retries now reject with `TemporizeTimeoutError`, retaining the last
  failure in `cause` and reporting the attempt count in `attempts`.
- Expanded JSDoc for every public core, React, and Vue export.

## [0.2.0] - 2026-08-01

### Added

- `batch` for collecting argument tuples into shared invocations.
- `retry` with exponential backoff, jitter, filtering, and cancellation.
- `idle` with a `requestIdleCallback` implementation and portable timer fallback.

## [0.1.0] - 2026-08-01

### Added

- Promise-aware `debounce`, `throttle`, `rafThrottle`, `debounceAsync`, and
  `throttlePromise` utilities.
- React hooks under `@alsoftworks/temporize/react`.
- Vue composables under `@alsoftworks/temporize/vue`.
- Dual ESM/CommonJS builds, TypeScript declarations, tests, and benchmarks.

[unreleased]: https://github.com/nyvexis1/temporize/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/nyvexis1/temporize/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/nyvexis1/temporize/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/nyvexis1/temporize/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/nyvexis1/temporize/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/nyvexis1/temporize/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/nyvexis1/temporize/releases/tag/v0.1.0
