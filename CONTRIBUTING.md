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

## Pull requests

Keep each pull request narrow, explain user-visible behavior and compatibility,
and update README/API documentation plus `CHANGELOG.md` when appropriate. CI
must pass on Node 18, 20, and 22. Avoid unrelated cleanup in behavior changes so
reviews remain easy to verify.
