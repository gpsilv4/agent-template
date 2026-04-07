# Contributing

Thank you for your interest in contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone <your-fork-url>`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature`
5. Read the project rules: `.agent/rules/core-rules.md`

## Development Workflow

Follow the workflows in `.agent/workflows/`:

| Task | Workflow |
|------|----------|
| New feature | `/plan` -> implement -> `/review` |
| Bug fix | `/debug` -> implement -> `/review` |
| Refactor | `/refactor` -> implement -> `/review` |

## Commit Messages

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

1. Ensure CI passes (TypeScript, lint, build, tests, audit)
2. Fill in the PR template checklist (`.github/pull_request_template.md`)
3. Update documentation if needed (see sync docs checklist in `process-rules.md`)
4. Request review from CODEOWNERS
5. Squash and merge after approval
6. After sprint/release merge: create version tag (`git tag vX.Y.Z -m "Description"` + `git push origin --tags`)

## Testing

```bash
npm run test:unit       # Unit tests
npm run test            # E2E tests (Playwright)
npm run test:security   # Security tests
npm run test:audit      # Dependency audit
npm run test:all        # All tests
```

## Questions?

Open an issue using the appropriate template in `.github/ISSUE_TEMPLATE/`.
