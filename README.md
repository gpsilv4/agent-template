# Agent Template

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/gpsilv4/agent-template/actions/workflows/ci.yml/badge.svg)](https://github.com/gpsilv4/agent-template/actions/workflows/ci.yml)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://conventionalcommits.org)

Reusable GitHub Template for configuring AI agents (Claude Code, Gemini, Cursor, Copilot) in software projects.

> **Nota / Note**: Documentation inside `.agent/` and `src/docs/` is written in **Portuguese (PT-PT)** as it was designed for Portuguese-speaking teams. The BOOTSTRAP process allows the AI to adapt all content to any language during setup.

---

## What is this?

### The Problem

AI coding agents (Claude Code, Gemini, Cursor, Copilot) are powerful but **stateless** — they forget your project's rules, architecture, business logic, and conventions between sessions. Without persistent context, you repeat yourself constantly: "use SWR not useEffect", "files under 400 lines", "never commit without asking", etc.

### The Solution

This template gives your AI agent a **persistent brain** via the `.agent/` folder:

- **Rules** — coding standards, business logic, page architecture (the AI reads these before every action)
- **Workflows** — step-by-step processes for planning, debugging, reviewing, deploying (the AI follows these like checklists)
- **Context** — session state, decisions, backlog, release history (the AI picks up where the last session left off)
- **Scripts** — automation tools (bundle size checker, etc.)

Plus **DevOps best practices** via `.github/`:

- **CI/CD Pipelines** — TypeScript, lint, build, tests, security audit on every PR
- **PR/Issue Templates** — structured checklists aligned with the AI workflows
- **Dependabot** — automatic dependency updates
- **Governance** — CODEOWNERS, branch protection guidance, Conventional Commits

### The Result

When you open a new AI session in any project using this template, the agent **already knows**:
- Your coding standards and what's forbidden
- Your business domain and rules
- Your git/branch/PR process
- What was done in the last session and what's next
- How to plan, review, debug, refactor, and deploy

**One-time setup, permanent context across all sessions and all AI agents.**

---

## What's included

```
.agent/                         <- AI knowledge management
├── BOOTSTRAP.md                <- Setup guide: Phase 0 (analysis) + Phase 1 (config) — run once
├── rules/
│   ├── core-rules.md           <- Code standards, DRY, CI/CD, security
│   ├── process-rules.md        <- Git, branches, sprints, backlog, archiving
│   ├── anti-patterns.md        <- Bug-derived anti-patterns + review greps (loaded)
│   ├── sync-docs.md            <- Pre-commit docs checklist (NOT loaded; on-demand)
│   └── ticket-method.md        <- Per-ticket 5-phase method (NOT loaded; on-demand)
├── context/
│   ├── session.md              <- Current session state
│   ├── task.md                 <- Tasks in progress
│   ├── decisions.md            <- Architectural decisions (append-only)
│   ├── walkthrough.md          <- Release summaries
│   ├── implementation_plan.md  <- Implementation plan
│   ├── backlog.md              <- Backlog: active work (imported into context)
│   ├── backlog-archive.md      <- Closed items + closed sprints (NOT imported)
│   ├── audit-history.md        <- /audit baselines, accumulated (NOT imported; created on first run)
│   ├── decisions-archive.md    <- Archived old decisions (NOT imported)
│   └── walkthrough-archive.md  <- Archived old releases (NOT imported)
├── workflows/
│   ├── setup.md                <- /setup — Developer onboarding
│   ├── plan.md                 <- /plan — Plan new feature
│   ├── review.md               <- /review — Code review + CI check
│   ├── design-review.md        <- /design-review — UI/UX quality rubric (tier-based)
│   ├── refactor.md             <- /refactor — Safe refactoring
│   ├── deploy.md               <- /deploy — Deploy with CI gate
│   ├── debug.md                <- /debug — Structured debugging
│   ├── e2e-tests.md            <- /e2e-tests — E2E tests (Playwright)
│   ├── security-tests.md       <- /security-tests — Security tests
│   ├── audit.md                <- /audit — Full project/app health audit (multi-lens)
│   └── market-scan.md          <- /market-scan — Market/competitor analysis + feature ideation
└── scripts/
    ├── check-bundle-sizes.mjs  <- Bundle size checker (Next.js)
    ├── check-doc-versions.mjs  <- Doc guards: entry point + doc-parity guards
    ├── guards/                 <- Guard modules split out of the entry point
    │   ├── settings.mjs        <- Guard 11: .claude/settings.json permission boundary
    │   ├── versions.mjs        <- Guard 3 + documented dependency versions
    │   ├── derived-counts.mjs  <- Guards 12/12c/12d: counts cited in prose, recomputed
    │   └── placeholders.mjs    <- Guard 13: {{...}} left behind after bootstrap
    ├── check-backlog.mjs       <- Backlog counters/progress + duplicate-ID checker
    ├── test-guards.mjs         <- Entry point for the doc-guard suites (no deps, no package.json)
    ├── test-harness.mjs        <- Shared sandbox + test() + summary
    ├── tests-settings.mjs      <- Guard 11 tests (mirrors guards/settings.mjs)
    ├── tests-derived-counts.mjs<- Guards 12/12c/12d tests
    ├── tests-placeholders.mjs  <- Guard 13 tests (simulates a completed bootstrap)
    ├── test-bundle-sizes.mjs   <- Negative tests for the bundle checker (no Next.js needed)
    ├── test-backlog.mjs        <- Negative tests for the backlog checker (synthetic fixture)
    ├── mutation-sweep.mjs      <- Proves the suites assert: disables each warning, demands red
    └── test-mutation-sweep.mjs <- Negative tests for the sweep itself (fake checker + fake suite)

.github/                        <- DevOps & governance
├── workflows/
│   ├── ci.yml                  <- CI: TypeScript, lint, build, tests, audit, secret-scan
│   ├── e2e.yml                 <- E2E + security tests (manual trigger)
│   └── dependabot-auto-merge.yml <- Auto-merge patch/minor Dependabot PRs (OPT-IN, off by default)
├── ISSUE_TEMPLATE/
│   ├── bug_report.md           <- Template para reportar bugs
│   └── feature_request.md      <- Template para pedir features
├── pull_request_template.md    <- Checklist obrigatoria em cada PR
├── dependabot.yml              <- Updates automaticos de dependencias
└── CODEOWNERS                  <- Reviewers automaticos por ficheiro

.claude/                        <- Native Claude Code layer (optional; other tools ignore it)
├── settings.json              <- Project permissions (deny secrets, allow safe scripts)
├── commands/                  <- Real slash commands (/plan, /review, ...) wrapping .agent/workflows/
└── agents/                    <- Subagents: code-reviewer (read-only), debugger

.gemini/                        <- Native Gemini CLI layer
└── commands/                  <- Same slash commands as .claude/, in TOML (wrap .agent/workflows/)

.editorconfig                   <- Formatting config (2-space indent, LF)
.nvmrc                          <- Node version pinning (matches CI)
AGENTS.md                       <- Cross-tool entry point (ChatGPT/Codex, Windsurf, Zed, ...)
CLAUDE.md                       <- Entry point for Claude Code / Cursor
CODE_OF_CONDUCT.md              <- Contributor Covenant
CONTRIBUTING.md                 <- Dev workflow, commit format, PR process
GEMINI.md                       <- Entry point for Google Gemini
LICENSE                         <- MIT (customize copyright in bootstrap)
README.md                       <- This file
SECURITY.md                     <- Vulnerability disclosure policy
src/docs/
├── agent-guide.md              <- Guide for .agent/ and .github/
└── CHANGELOG.md                <- Changelog template
```

## How to use

### 1. Create repo from template

```bash
# Via GitHub CLI
gh repo create my-project --template gpsilv4/agent-template --clone --public
# or --private / --internal
cd my-project

# Or via GitHub UI: "Use this template" -> "Create a new repository"
```

### 2. Open AI and let BOOTSTRAP.md guide you

```bash
# Open Claude Code (or any other agent)
claude

# The AI reads BOOTSTRAP.md via CLAUDE.md and starts the process automatically.
# If it doesn't, ask:
# "Read .agent/BOOTSTRAP.md and configure the project"
```

The AI will:
1. **Phase 0 (if needed)** — If you don't know what stack/architecture to use, the AI analyzes your project description and recommends platforms, stack, architecture, and flags risks — step by step, waiting for your confirmation at each step
2. Ask questions about your project (or auto-fill from Phase 0 decisions)
3. Replace all `{{PLACEHOLDER}}` values across files
4. Generate `business-logic.md` and `pages-architecture.md` from scratch
5. Adapt workflows, CI/CD, and scripts to your stack

> **Don't know what tech to use?** Just describe your project in 3-5 sentences. The AI will guide you through every technical decision before touching any files.

### 3. Verify and commit

```bash
# Verify no placeholders remain. Must return zero lines.
#   git grep --untracked  -> every tracked AND newly generated file, but nothing
#                            .gitignore'd (no node_modules/dist/.next noise)
#   sed                   -> blanks out the two non-placeholder uses of {{ }}:
#                            GitHub Actions ${{ ... }} expressions and Gemini's
#                            own {{args}} token. Blanking (not dropping the line)
#                            keeps a line that mixes one of those with a REAL
#                            placeholder visible.
#   the two excluded files are the placeholder catalogs themselves — drop the
#   README exclusion once you replace it with your project's own.
# NOTE: clean means "no output"; the pipeline then exits 1 (grep found nothing).
#       Invert it if you ever wire this into CI as a gate.
git grep -n --untracked "{{" -- ':!.agent/BOOTSTRAP.md' ':!README.md' \
  | sed -e 's/\${{[^}]*}}//g' -e 's/{{args}}//g' | grep "{{"

# Initial commit
git add .
git commit -m "chore: bootstrap agent config"
```

### 4. Start developing

```bash
# Plan a feature
# -> tell the AI: "run /plan for X"

# Fix a bug
# -> tell the AI: "run /debug for Y"

# Review before commit
# -> tell the AI: "run /review"
```

## CI/CD Pipelines

### `ci.yml` — Runs automatically on every PR and push to main

| Step | What it does |
|------|--------------|
| TypeScript | `npx tsc --noEmit` — 0 errors (skipped if there is no `tsconfig.json`) |
| Lint | `npm run lint` — no warnings (skipped if there is no `lint` script) |
| Build | `npm run build` — verify bundle (skipped if there is no `build` script) |
| Unit Tests | `npm run test:unit` (skipped if there is no `test:unit` script) |
| Security Audit | `npm audit --audit-level=high` — **informative, does not block the merge** (`continue-on-error`) |
| Secret Scan | `gitleaks` — scans full history for committed secrets (runs always, even on the bare template) |
| Doc Guards | `node .agent/scripts/check-doc-versions.mjs` — rules byte-budget, CLAUDE/GEMINI parity, workflow↔wrapper parity, CHANGELOG/version sync, banned terms (opt-in, uncomment in ci.yml) |
| Backlog | `node .agent/scripts/check-backlog.mjs` — validates counters/progress bar, detects duplicate IDs (opt-in, uncomment in ci.yml) |
| Guard Tests | `node .agent/scripts/test-guards.mjs` — breaks each doc guard on purpose and asserts it warns and exits non-zero (runs on every push/PR in the `guard-tests` job) |
| Bundle Tests | `node .agent/scripts/test-bundle-sizes.mjs` — fake `.next/` trees asserting the bundle checker fails rather than reporting an unmeasured number (runs in the `guard-tests` job) |
| Backlog Tests | `node .agent/scripts/test-backlog.mjs` — synthetic backlog fixture; breaks one counter/state/ID at a time and asserts the checker warns (runs in the `guard-tests` job) |
| Mutation Sweep | `node .agent/scripts/mutation-sweep.mjs` — disables each checker's warning sites one by one and demands the suite goes red; also fails if a checker has no suite. Includes **itself** as a target. Minutes, not seconds — run locally after touching a `check-*.mjs` (opt-in in ci.yml) |
| Sweep Tests | `node .agent/scripts/test-mutation-sweep.mjs` — fake checker + fake suite with known behaviour; asserts the sweep detects an untested warning site and fails on every failure path (runs in the `guard-tests` job) |

> **Why the steps are guarded:** the `detect` job only proves a `package.json` exists. Each step then checks for its own toolchain (`tsconfig.json`, a `lint`/`build`/`test:unit` script) so a project that doesn't use it gets a skip instead of a red X. Once your stack is fixed, drop the guard and let the step fail for real. The audit is deliberately non-blocking — transitive high-severity advisories are common and often unfixable without a breaking bump; review the report and escalate it to a hard gate (remove `continue-on-error`) once your dependency tree is clean.

> CI runs on `pull_request` + `push` with a least-privilege `permissions: contents: read` block. Dependabot PRs ride the normal `pull_request` path (GitHub's safe default: read-only token, no secrets) — no `pull_request_target` needed, since no CI step requires secrets. A separate `secret-scan` (gitleaks) job runs on every push, even on the bare template.

### `e2e.yml` — Manual trigger (workflow_dispatch)

| Step | What it does |
|------|--------------|
| E2E Tests | `npm run test` — Playwright headless |
| Security Tests | `npm run test:security` |
| Report | Upload Playwright report on failure |

> E2E is separate from CI because it's slower and requires test credentials. Enable on PRs by uncommenting the trigger in the file.

### Dependabot

- Weekly npm dependency updates (minor + patch grouped)
- Weekly GitHub Actions updates
- Automatic PRs labelled `dependencies` / `ci` — **but only if those labels exist in the repo**. Dependabot applies existing labels; it does not create them, and silently opens unlabelled PRs otherwise:
  ```bash
  gh label create dependencies -d "Dependency updates (Dependabot)" -c 0366d6
  gh label create ci           -d "CI/CD and GitHub Actions"        -c 1d76db
  gh label create automerge    -d "Opt-in: Dependabot auto-merge"   -c fbca04
  ```

### GitHub Configuration

| File | What it does |
|------|--------------|
| `CODEOWNERS` | Automatic reviewers per file/folder |
| `pull_request_template.md` | Required checklist aligned with `/review` |
| `ISSUE_TEMPLATE/bug_report.md` | Structured bug reporting |
| `ISSUE_TEMPLATE/feature_request.md` | Structured feature requests |
| `dependabot.yml` | Weekly automatic dependency updates |
| `.editorconfig` | 2 spaces, UTF-8, LF — cross-IDE consistency |
| `LICENSE` | MIT by default (customizable in bootstrap) |

### Tags & Releases

Each version (vX.Y.Z) has an annotated git tag. Tags are created after each sprint/release is merged to main. Visible at **GitHub > Code > Tags**.

### Branch Protection

Branch protection rules (require status checks, block force push) require **GitHub Pro** for private repos. The CI works as an **informational semaphore** — shows green/red on PRs and the developer decides. If Pro becomes available, enable in GitHub Settings > Branches.

> **Note**: CI jobs include `if: hashFiles('package.json') != ''` to skip gracefully on the template repo (which has no code). On repos created from the template, they run normally.

## Placeholders

| Placeholder | Description |
|-------------|-------------|
| `{{PROJECT_NAME}}` | Project name |
| `{{PROJECT_SLUG}}` | Kebab-case slug |
| `{{PROJECT_DESCRIPTION}}` | Short description (1-2 sentences) |
| `{{DOMAIN_DESCRIPTION}}` | Detailed domain description |
| `{{FRAMEWORK}}` | Frontend framework |
| `{{BACKEND}}` | Backend/BaaS |
| `{{STYLING}}` | Styling framework |
| `{{STATE_MANAGEMENT}}` | State/data fetching management |
| `{{KEY_LIBRARIES}}` | Key libraries |
| `{{TEST_FRAMEWORK}}` | Test framework |
| `{{STACK}}` | Full stack (1 line) |
| `{{UI_LANGUAGE}}` | UI language (e.g., "PT-PT", "EN") |
| `{{HOSTING}}` | Hosting platform |
| `{{TYPES_FILE}}` | Main types file path |
| `{{ENV_VARS_TEMPLATE}}` | Environment variables template |
| `{{TEST_ENV_VARS}}` | Test environment variables |
| `{{PROJECT_STRUCTURE}}` | Directory tree |
| `{{SECURITY_EMAIL}}` | Security disclosure email |
| `{{COPYRIGHT_HOLDER}}` | License copyright holder |
| `{{YEAR}}` | Current year |
| `{{DATE}}` | Current date (auto-filled in context files) |
| `{{AGENT_NAME}}` | Name of the AI agent running bootstrap (auto) |
| `{{SPRINT_DESCRIPTION}}` | First sprint description (auto/placeholder) |
| `{{QUALITY_TIER}}` | UI quality tier: MVP / Polido / Elite (or N/A if no UI) |
| `{{GITHUB_OWNER}}` | GitHub username/team for CODEOWNERS (e.g. `your-org`) |

## Files generated by AI (not in template)

- `.agent/rules/business-logic.md` — Domain business rules
- `.agent/rules/pages-architecture.md` — Page architecture and UI

## AI Agent Compatibility

| Agent | File it auto-loads | Slash commands | Verified how |
|-------|--------------------|----------------|--------------|
| Claude Code | `CLAUDE.md` (+ `.claude/`) | native, 11 | Used throughout this template's own development |
| Google Gemini CLI | `GEMINI.md` | native, 11 (`.gemini/commands/`) | Entry file and wrappers checked by Guards 2, 6, 7, 10 |
| GitHub Copilot | `.github/copilot-instructions.md` | no | File shipped and points to `AGENTS.md`; **not exercised in a real Copilot session** |
| Cursor | `.cursor/rules/*.mdc` | no | Same — shipped, pointing to `AGENTS.md`; **not exercised in a real Cursor session** |
| ChatGPT / Codex | `AGENTS.md` | no | Same — `AGENTS.md` is its documented convention; **not exercised** |
| Windsurf, Zed, others | `AGENTS.md` (if supported) | no | Unverified — check your tool's docs for which file it loads |

> **On "verified"**: an earlier version of this table marked Cursor and Copilot as *Tested*
> while listing `CLAUDE.md` as their entry file — which neither tool loads, and no such test
> had been run. The columns above say what was actually done. If you exercise one of the
> unverified rows, a PR correcting it is welcome.

> **Why multiple entry files?** Claude Code parses `@file`, Gemini needs `@[file]` brackets, and `AGENTS.md` is the tool-neutral cross-tool entry. All share the same source of truth in `.agent/` — only syntax/entry differs.

### The `.claude/` layer works with other agents too

`.claude/` (slash commands, subagents, `settings.json`) is read **only by Claude Code** — other tools ignore it. But **no logic lives there**: each command is a thin wrapper that says *"read and follow `.agent/workflows/<name>.md`"*. The workflows, rules, and context all live in `.agent/`, which **every agent reads**.

- **Claude Code**: `/plan`, `/review`, etc. are typed slash commands; the permission boundary and subagents apply.
- **Gemini CLI**: the same 11 commands ship as `.gemini/commands/*.toml`.
- **Any other agent**: ask *"run /plan"* or *"follow `.agent/workflows/plan.md`"* — the identical file.

**What you do lose outside Claude Code**, stated plainly rather than waved away:

| Lost | Consequence | What to do instead |
|------|-------------|--------------------|
| `.claude/settings.json` | No enforced boundary: nothing blocks reading `.env*`, and nothing forces a prompt before `git commit`/`push` or `npm install`. Guard 11 has nothing to check and skips | Use your tool's own permission/approval settings, and keep the rules in `.agent/rules/` as the stated contract |
| `.claude/agents/code-reviewer.md` | **Fase 4** of the per-ticket method has no subagent | Run it as a separate session given only the diff — the point is a reader without the author's reasoning, not the mechanism |
| Typed slash commands (except Gemini) | `/plan` is not a keystroke | Say *"follow `.agent/workflows/plan.md`"*. The wrappers were never more than that sentence |

Everything that carries logic — rules, workflows, context, the guards and their tests — is in
`.agent/` and `.agent/scripts/`, which any agent can read and any shell can run. The guards
need only Node; they have no dependencies and no `package.json`.

Native slash commands ship for **both** Claude Code (`.claude/commands/`) and Gemini CLI (`.gemini/commands/*.toml`) — same commands, thin wrappers over `.agent/workflows/`. `.github/copilot-instructions.md` and `.cursor/rules/project.mdc` ship as equally thin pointers to `AGENTS.md`, because those are the files those tools load; neither adds logic.

## Commit Convention

This template enforces [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): add new feature
fix(scope): resolve bug
docs(scope): update documentation
test(scope): add tests
chore(scope): maintenance
ci(scope): pipeline changes
```

Full guide in [CONTRIBUTING.md](CONTRIBUTING.md) and `.agent/rules/process-rules.md`.

## Maintenance

When you evolve rules in a project and want to propagate to the template:
1. Update the file in the template repo
2. Existing projects are **not** affected (already customized)
3. To propagate: manual cherry-pick of generic files

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, commit format, and PR process.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability disclosure policy.

## License

[MIT](LICENSE) — customize the copyright holder during bootstrap.
