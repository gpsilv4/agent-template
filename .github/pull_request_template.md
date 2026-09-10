## Summary

<!-- 1-3 bullet points describing what this PR does and why -->

-

## Changes

<!-- List the key changes, grouped logically -->

-

## Checklist

- [ ] `npx tsc --noEmit` passes (0 errors)
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] Bundle sizes within targets (if configured — `node .agent/scripts/check-bundle-sizes.mjs`)
- [ ] Unit tests pass (`npm run test:unit`)
- [ ] E2E tests pass (`npm run test`)
- [ ] Security tests pass (`npm run test:security`)
- [ ] Dependency audit reviewed (`npm run test:audit`) — it is informative in CI, so green does not mean clean
- [ ] Doc guards pass (`node .agent/scripts/check-doc-versions.mjs`) — no WARN
- [ ] If `.agent/scripts/` or `.claude/hooks/` changed: guard tests pass (`test-guards.mjs`, `test-bundle-sizes.mjs`, `test-backlog.mjs`, `test-mutation-sweep.mjs`, `test-test-surface.mjs`, `.claude/hooks/tests/test-hooks.mjs`)
- [ ] If a `check-*.mjs` changed: `node .agent/scripts/mutation-sweep.mjs` exits 0 (every warning site goes red; no checker without a suite)
- [ ] Test surface not weakened (`node .agent/scripts/check-test-surface.mjs`) — no deleted/skipped tests, no dropped counts
- [ ] Backlog counters valid (`node .agent/scripts/check-backlog.mjs`) — 0 divergences
- [ ] CI is green on the branch — never merge on red, and **check that checks exist**: `gh pr checks --watch` exits 0 when none have been reported yet
- [ ] `src/docs/CHANGELOG.md` updated
- [ ] `.agent/context/backlog.md` updated (if applicable)
- [ ] No secrets or credentials in committed files
- [ ] **L ticket, or touches the core domain?** Independent reader ran (Fase 4 — the
      `code-reviewer` subagent, or a separate session given only the diff), each finding
      **verified against the real file**, and CONFIRMED vs PLAUSIBLE stated. It reads code;
      it is not a substitute for the `/review` passes above

## Test Plan

<!-- How can reviewers verify this works? -->

-
