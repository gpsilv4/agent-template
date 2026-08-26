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
- [ ] If `.agent/scripts/` changed: guard tests pass (`node .agent/scripts/test-guards.mjs`, `node .agent/scripts/test-bundle-sizes.mjs`)
- [ ] Backlog counters valid (`node .agent/scripts/check-backlog.mjs`) — 0 divergences
- [ ] CI is green on the branch (`gh pr checks`) — never merge on red
- [ ] `src/docs/CHANGELOG.md` updated
- [ ] `.agent/context/backlog.md` updated (if applicable)
- [ ] No secrets or credentials in committed files

## Test Plan

<!-- How can reviewers verify this works? -->

-
