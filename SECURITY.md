# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do NOT open a public issue.**

- **Preferred — GitHub private vulnerability reporting:** on the repository's **Security** tab,
  click **Report a vulnerability**. The report stays private between you and the maintainers.
  (Only exists on **public** repositories, once the maintainers turn it on — see [`src/docs/github-security.md`](src/docs/github-security.md).)
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
  turned on by hand; none on a private one without a license (see `src/docs/github-security.md`)
- **Security Tests**: {{TEST_FRAMEWORK}}-based security test suite (headers, XSS, auth bypass, CSRF, IDOR)
- **RLS / Auth**: Backend security policies documented in `.agent/rules/core-rules.md`
- **Zero Secrets**: No credentials in committed files — enforced by rules, PR checklist, and automated scanning (below)

## Enable on GitHub (public vs. private repository)

These are **repository settings**, not files: a project created from this template does **not**
inherit them, and an `/upgrade` does not change them. What is free on a public vs. a private
repository, and how to read and enable them with `gh api`, lives in
[`src/docs/github-security.md`](src/docs/github-security.md) — one place, so that deleting this file
does not delete the reminder.

## Secret Scanning (Zero Secrets)

The rule "ZERO sensitive data in committed files" (`.agent/rules/core-rules.md`) is enforced at three layers:

1. **Prevention — GitHub Secret Scanning + Push Protection** (public repositories; see
   `src/docs/github-security.md`): `Settings > Advanced Security` → **Secret Protection** and **Push protection**.
   Push protection **blocks the push** if a secret is detected — the cheapest, strongest gate.
2. **CI gate — Gitleaks** (`.github/workflows/ci.yml`, `secret-scan` job): scans the commits of every
   PR and every push (#372: a direct web-UI commit on `main` included). Runs even on the bare template, on any plan — the layer that covers
   a private repository without secret scanning.
   **Note:** on **organization-owned** repos `gitleaks-action` needs a free `GITLEAKS_LICENSE`
   (set it as a repository secret — the env line in `ci.yml` is already there); personal repos
   need nothing.
3. **Human — PR checklist** (`.github/pull_request_template.md`) and `/review`.

If a secret is ever committed: **rotate it immediately** (assume it is compromised), then purge it
from history (`git filter-repo` / BFG). Removing it from `HEAD` alone is not enough.
