# @circlesac/lint

🔧 Zero-config lint, format, typecheck, and structure checks for Circles repositories, powered by Biome.

Consumers keep no lint or format configuration of their own. The shared Biome configuration ships inside this package and is passed to the bundled Biome on every run; the Circles overrides on top of Biome's defaults are `suspicious/noExplicitAny: error` and `complexity/noStaticOnlyClass: off`.

## Usage

```bash
npx @circlesac/lint --all            # Biome check with fixes and formatting, then TypeScript
npx @circlesac/lint --all --no-fix   # read-only gate for CI and test scripts
npx @circlesac/lint --biome          # Biome only
npx @circlesac/lint check            # structure checks (Workers API set when wrangler.jsonc is present)
npx @circlesac/lint check --json
```

### Repository scripts

```json
{
  "scripts": {
    "lint": "lint --all --no-fix",
    "format": "lint --biome",
    "check": "lint check",
    "test": "bun run lint && bun run check && vitest run --coverage"
  }
}
```

Add the package as a dev dependency so the `lint` binary resolves: `bun add -d @circlesac/lint`.

### `check`

Deterministic checks for what a linter cannot see. Every repository gets the generic set: Bun lockfile only, no neutralized gates (`|| true`), no `latest` or wildcard ranges, no exact version pins, the four scripts above, no scaffold leftovers, and no repository Biome config that weakens `noExplicitAny`. A repository with `wrangler.jsonc` also gets the Workers API set: `wrangler types` with the generated file ignored and not committed, no published Workers type package, controllers under `src/controllers/<category>/` with `index.ts` and `schemas.ts`, one class per route with a static `route` and a static `handle`, validated inputs only, `/openapi.json` and `/docs` served from `src/index.ts`, tests calling the app-typed client built over `app.fetch` with an execution context, a Workers-pool runner config, and a README that links `/docs` with a Tooling section.

The command exits 1 on any failure, so `bun run test` gates on it.

## Failure logs

When a tool fails, the full output is saved to `$TMPDIR/circlesac-lint-<tool>-<timestamp>.log` and, in GitHub Actions, appended to the step summary.
