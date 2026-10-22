# Contributing

Thank you for your interest in contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone <your-fork-url>`
3. Enable the versioned git hooks: `git config core.hooksPath .githooks`
4. Install dependencies: `npm install`
5. Create a branch: `git checkout -b feature/your-feature`
6. Read the project rules: `.agent/rules/core-rules.md`

## Development Workflow

Follow the workflows in `.agent/workflows/`:

| Task | Workflow |
|------|----------|
| New feature | `/plan` -> implement -> `/review` |
| Large or ambiguous ticket | `/grill` -> `/plan` -> implement -> `/review` |
| Bug fix | `/debug` -> implement -> `/review` |
| Refactor | `/refactor` -> implement -> `/review` |
| UI change | its type's flow, then `/design-review` after `/review` |
| Full sprint | implement all -> `/review` -> `/deploy` |
| Milestone (end of sprint, pre-release) | `/audit` -> backlog proposals, approved first |
| Product strategy | `/market-scan` -> backlog proposals, approved first |
| Opening a sprint, or after a release | `/backlog-review` -> backlog proposals, approved first |

## Dependencies and the lockfile

`npm install` once and **commit `package-lock.json`**. CI runs `npm ci`, which requires a
lockfile by definition — without it the install step fails before any check runs. If the
project uses pnpm/yarn/bun, adjust the install step and the `cache:` key in
`.github/workflows/ci.yml` to match.

## Commit Messages

**No AI attribution.** Commit messages carry the description of the change and nothing else:
no `Co-Authored-By` naming an AI tool, no "Generated with ...", no robot emoji. A commit
message is immutable once merged, which is why this is enforced by the versioned `commit-msg`
hook rather than left to review — run step 3 of Getting Started and it applies to every tool
and every person, agents included. A human co-author is fine.

**Changing the gate on purpose: the `Test-Surface:` trailer.** In a workflow that runs tests
(a `node ...test` step, or `npm|pnpm|yarn|bun test`, `npm run test:*`, `npx vitest|jest|playwright test|cypress run|mocha`,
`pytest`, `python -m unittest`, `go|cargo|dotnet|make test`, `node --test`), changing the top-level `on:`, `env:` or
`defaults:`, or changing or removing a STEP that mentions `.agent/scripts/`, `.claude/hooks/` or
`.githooks/` (or the job it runs in: its `if:`, `needs:`, `env:`...), fails the
`check-test-surface` step — it changes the gate without touching a test (#285). Adding a new
step does not, and neither does adding a suite line to the parallel suites step, inside the
chain that starts at the runner (#341); removing one, or touching the runner, does. When the change is deliberate, add a trailer to the LAST commit of the PR that
touches that file, with the file and the reason (`—`, `--` or ` - ` as the separator):

```
Test-Surface: .github/workflows/ci.yml — the release branch needs the gate too
```

The warning becomes a note that shows the reason. A trailer with no reason does not count, it
only covers that file, and a trailer in an earlier commit does not cover a later change to it.
The trailer is read from the commits, so an uncommitted change always warns locally. Removing
tests or lowering a count has no such exit, and neither have the `package.json` test scripts (`test`,
`test:unit`, `test:e2e`, `test:security`, `test:all`): renaming one, or replacing its runner, warns.

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
[optional footer]
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, missing semicolons (no code change) |
| `refactor` | Code restructuring (no feature/fix) |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Maintenance (deps, configs, CI) |
| `ci` | CI/CD pipeline changes |

### Examples

```bash
feat(dashboard): add monthly export filter
fix(auth): prevent redirect loop on OAuth callback
docs(readme): update CI/CD pipeline section
test(e2e): add profile data persistence test
chore(deps): update playwright to v1.45
ci(actions): add Playwright browser caching
```

## Code Style

- **TypeScript strict** — `any` is forbidden
- **Max file size**: ~400 lines (flag at >500)
- **Formatting**: See `.editorconfig` (2 spaces, UTF-8, LF)
- **Full rules**: `.agent/rules/core-rules.md`

## Pull Request Process

1. Ensure CI passes (TypeScript, lint, build, tests) and **read the security audit report** — it is informative by default, so it stays green even with advisories
2. Fill in the PR template checklist (`.github/pull_request_template.md`)
3. Update documentation if needed (see the sync-docs checklist in `.agent/rules/sync-docs.md`)
4. Request review from CODEOWNERS
5. Squash and merge after approval
6. After sprint/release merge: sync `main` first, then tag it — after a squash merge your local `main` is stale, so tagging without pulling would tag the feature branch (`git checkout main && git pull --ff-only origin main`, then `git tag -a vX.Y.Z -F <file>` + `git push origin vX.Y.Z` — the message in a file outside the repo, first line = title; never `-m "..."`: a backtick inside it is executed by the shell). The GitHub Release is created automatically from the tag (`.github/workflows/release.yml`)

## Testing

```bash
npm run test:unit       # Unit tests
npm run test:e2e        # E2E tests ({{TEST_FRAMEWORK}})
npm run test:security   # Security tests
npm run test:audit      # Dependency audit
npm run test:all        # unit + E2E + security + audit
```

## Questions?

Open an issue using the appropriate template in `.github/ISSUE_TEMPLATE/`.
