# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do NOT open a public issue.**

- **Preferred — GitHub private vulnerability reporting:** on the repository's **Security** tab,
  click **Report a vulnerability**. The report stays private between you and the maintainers.
  (Only exists on **public** repositories — see the table below.)
- **Or email** **{{SECURITY_EMAIL}}** — the only channel on a private repository.

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive a best-effort response acknowledging receipt. <!-- Set a concrete SLA (e.g. "within 48 hours") if your project commits to one. -->

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
| Older   | No        |

## Security Best Practices

This template enforces security through:

- **CI Pipeline**: Automated `npm audit --audit-level=high` on every PR — reported, but **non-blocking** by default (`continue-on-error` in `ci.yml`), since transitive high-severity advisories are often unfixable without a breaking bump. Remove `continue-on-error` to make it a hard gate once your dependency tree is clean.
- **Dependabot**: Weekly automatic dependency updates
- **CodeQL**: static analysis — in a project, GitHub's "Default setup" on a **public** repository,
  turned on by hand; none on a private one without a license (see below)
- **Security Tests**: {{TEST_FRAMEWORK}}-based security test suite (headers, XSS, auth bypass, CSRF, IDOR)
- **RLS / Auth**: Backend security policies documented in `.agent/rules/core-rules.md`
- **Zero Secrets**: No credentials in committed files — enforced by rules, PR checklist, and automated scanning (below)

## Enable on GitHub (public vs. private repository)

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
| **Code scanning (CodeQL)** | free | not available: the **GitHub Code Security** license is sold only to organizations (Team/Enterprise) — and without it, CodeQL must **not** run at all (below) |
| **Secret scanning + push protection** | free | not available for user-owned private repos (GitHub Enterprise only) |
| **Branch protection / rulesets** | free | can be configured, but is **not enforced** without **GitHub Pro** (or Team) |

The private column is for a **personal** account on the free plan. A private repository owned by
an **organization** has other options (e.g. buying GitHub Secret Protection or Code Security on
Team) — see [GitHub's plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans).

**CodeQL, case by case:**

- **Your project, public repository:** turn on **"Default setup"** (`Settings > Advanced
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

### On a private repository without a paid plan

Nothing breaks — the settings above that are unavailable simply do not appear, and no workflow
of the template needs them (CodeQL is not in a derived project's CI). What keeps protecting the
project, on any plan:

- **Gitleaks** (`ci.yml`, `secret-scan` job) — the replacement for secret scanning (below)
- **Dependabot** alerts, and the weekly version updates from `.github/dependabot.yml`
- The **guards** (`.agent/scripts/`), the **`commit-msg`** hook (`.githooks/`, checked again in CI)
- Without branch protection, CI is an **informative traffic light**: never merge with red checks

## Secret Scanning (Zero Secrets)

The rule "ZERO sensitive data in committed files" (`.agent/rules/core-rules.md`) is enforced at three layers:

1. **Prevention — GitHub Secret Scanning + Push Protection** (public repositories; see the table
   above): `Settings > Advanced Security` → **Secret Protection** and **Push protection**.
   Push protection **blocks the push** if a secret is detected — the cheapest, strongest gate.
2. **CI gate — Gitleaks** (`.github/workflows/ci.yml`, `secret-scan` job): scans the full git
   history on every push/PR. Runs even on the bare template, on any plan — the layer that covers
   a private repository without secret scanning.
   **Note:** on **organization-owned** repos `gitleaks-action` needs a free `GITLEAKS_LICENSE`
   (set it as a repository secret — the env line in `ci.yml` is already there); personal repos
   need nothing.
3. **Human — PR checklist** (`.github/pull_request_template.md`) and `/review`.

If a secret is ever committed: **rotate it immediately** (assume it is compromised), then purge it
from history (`git filter-repo` / BFG). Removing it from `HEAD` alone is not enough.
