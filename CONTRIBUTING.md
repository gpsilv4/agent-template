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
| Bug fix | `/debug` -> implement -> `/review` |
| Refactor | `/refactor` -> implement -> `/review` |

## Commit Messages

**No AI attribution.** Commit messages carry the description of the change and nothing else:
no `Co-Authored-By` naming an AI tool, no "Generated with ...", no robot emoji. A commit
message is immutable once merged, which is why this is enforced by the versioned `commit-msg`
hook rather than left to review — run step 3 of Getting Started and it applies to every tool
and every person, agents included. A human co-author is fine.

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
6. After sprint/release merge: sync `main` first, then tag it — after a squash merge your local `main` is stale, so tagging without pulling would tag the feature branch (`git checkout main && git pull origin main`, then `git tag vX.Y.Z -m "Description"` + `git push origin --tags`)

## Testing

```bash
npm run test:unit       # Unit tests
npm run test            # E2E tests ({{TEST_FRAMEWORK}})
npm run test:security   # Security tests
npm run test:audit      # Dependency audit
npm run test:all        # All tests
```

## Questions?

Open an issue using the appropriate template in `.github/ISSUE_TEMPLATE/`.
