# GitHub security settings (public vs. private repository)

> **Why this file exists** (#311, R7B-10): these settings used to be remembered only in `SECURITY.md`
> and in the bootstrap checklist — two files a derived project can legitimately delete. A real
> derived project ran with Dependabot alerts **off** since its bootstrap, and a critical advisory only
> surfaced when the CI audit broke on a PR that did not touch dependencies. `/upgrade` (section 4)
> and `/audit` (lens 4) point here, so the check survives both deletions.


These are **repository settings**, not files: a project created from this template does **not**
inherit them, and an `/upgrade` does not change them — check them after either. Turn them on in
`Settings > Advanced Security` (branch protection: `Settings > Branches` or `Settings > Rules`).
Availability depends on the repository's visibility and plan (checked against docs.github.com on 2026-10-08 — plans change,
so confirm there):

| Setting | Public repo | Private repo, free personal account |
|---|---|---|
| **Private vulnerability reporting** | free | not available (public repositories only) |
| **Dependency graph + Dependabot alerts** | free | free |
| **Dependabot security updates** (and grouped) | free | needs the two above; plan not stated in the docs — check whether it appears |
| **Code scanning (CodeQL)** | free | not available: the **GitHub Code Security** license is sold only to organizations (Team/Enterprise) — and without it, CodeQL must **not** run at all ("CodeQL, case by case", below) |
| **Secret scanning + push protection** | free | not available for user-owned private repos (GitHub Enterprise only) |
| **Branch protection / rulesets** | free | can be configured, but is **not enforced** without **GitHub Pro** (or an organization on Team) |

The private column is for a **personal** account on the free plan. A private repository owned by
an **organization** has other options (e.g. buying GitHub Secret Protection or Code Security on
Team) — see [GitHub's plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans).

**CodeQL, case by case:**

- **Your project, public repository:** once it has application code, turn on **"Default setup"** (`Settings > Advanced
  Security > CodeQL analysis`). It analyses your source folders, picks the languages itself, runs
  on GitHub's infrastructure and needs no file in the repository.
- **Your project, private repository without a Code Security license:** **do not run CodeQL**.
  Its [terms](https://github.com/github/codeql-cli-binaries/blob/main/LICENSE.md) forbid using it
  on code that is not open source ("e.g., code in a private repo in GitHub") — with or without
  uploading results — and it would spend Actions minutes for nothing visible.
- **This template's own repository:** `.github/workflows/codeql.yml` (with
  `.github/codeql/codeql-config.yml`) analyses the template's machinery, which lives in hidden
  folders that "Default setup" ignores. **It is template-only**: the bootstrap removes both files
  from a new project, and `/upgrade` does not bring them. Its job runs only while the repository
  is `gpsilv4/agent-template` (an `if:`): after a rename or a transfer it skips in silence —
  update the `if:` in `codeql.yml`.

## On a private repository without a paid plan

Nothing breaks — the settings above that are unavailable simply do not appear (except branch
protection/rulesets, which can be saved but are not enforced), and no workflow
of the template needs them (CodeQL is not in a derived project's CI). What keeps protecting the
project, on any plan:

- **Gitleaks** (`ci.yml`, `secret-scan` job) — the replacement for secret scanning (`SECURITY.md` § Secret Scanning)
- **Dependabot** alerts, and the weekly version updates from `.github/dependabot.yml`. Those wait a **7-day `cooldown`** (#377): a compromised version is usually pulled within hours or days, and with auto-merge on it would otherwise be merged in the next weekly run. Security updates don't wait (the `cooldown` only applies to version updates, per GitHub's Dependabot options reference); the cost is that, with the run on Mondays, the other updates arrive 7 to 13 days later
- The **guards** (`.agent/scripts/`), the **`commit-msg`** hook (`.githooks/`; its AI-attribution part is checked again in CI)
- Without branch protection, CI is an **informative traffic light**: never merge with red checks

## Reading and enabling them from the terminal

The agent can **read** the state with `gh api` and, when something the plan offers for free is off,
**propose turning it on and wait for a yes** — changing a repository setting is an action outside the
repository, and the user decides. Measured on this template's repository (2026-10-13).

```bash
R=$(gh repo view --json nameWithOwner -q .nameWithOwner)
# 1. FIRST: can this token read the settings at all? Without admin, a 404 below means "could not
#    read", not "off" — say so instead of reporting it as disabled.
gh api "repos/$R" --jq '{admin: .permissions.admin, private, security_and_analysis}'
# 2. Dependabot alerts: HTTP 204 = on, 404 = off (only meaningful with admin: true)
gh api "repos/$R/vulnerability-alerts" -i 2>&1 | head -1
# 3. Dependabot security updates: {"enabled": true|false}
gh api "repos/$R/automated-security-fixes"
```

Turning on, **only after the user's yes**:

```bash
gh api -X PUT "repos/$R/vulnerability-alerts"        # Dependabot alerts
gh api -X PUT "repos/$R/automated-security-fixes"    # Dependabot security updates
```

`security_and_analysis` (step 1) also shows secret scanning and push protection; on a private
repository of a free personal account they are absent or unavailable (the table above) — that is not
a finding.
