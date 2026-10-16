# Contributing to temporize

Thanks for helping improve temporize. Bug reports, focused feature proposals,
documentation fixes, and tested pull requests are welcome.

## Local setup

Use Node 18 or newer, then run:

```sh
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run size
npm run check:package
```

`npm run format` applies Prettier. ESLint uses the recommended TypeScript rules;
please keep changes formatted and free of lint errors.

## Adding an export

New public exports must:

- solve a focused timing, scheduling, rate-limiting, or concurrency problem;
- preserve full argument and return-type inference;
- have zero runtime dependencies;
- include complete JSDoc with parameter details, return behavior, and an example;
- include behavior, cancellation, error, and edge-case tests;
- remain below 1,000 bytes minified and gzipped when tree-shaken individually;
- be re-exported from `src/index.ts` without pulling framework adapters into the
  core entry point.

React and Vue features stay in their framework subpaths and must treat those
frameworks as optional peer dependencies.

## Playground

`examples/playground` is a small Vite app that people can open on StackBlitz
from the README. It installs the published package from npm, so update it after
a release when a demo should show a new feature:

```sh
npm install --prefix examples/playground
npm run dev --prefix examples/playground
```

## Benchmarks

`npm run bench` uses tinybench to measure raw call overhead against the
standalone `lodash.debounce` and `lodash.throttle` packages. It doesn't claim
the two behave the same: temporize creates a real promise for every call, which
is part of its contract and part of the measured cost.

## Pull requests

Keep each pull request narrow, explain user-visible behavior and compatibility,
and update `README.md`, `docs/API.md`, and `CHANGELOG.md` when appropriate. CI
must pass on Node 18, 20, and 22. Avoid unrelated cleanup in behavior changes so
reviews remain easy to verify.
