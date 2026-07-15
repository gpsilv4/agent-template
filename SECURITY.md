# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do NOT open a public issue.**

Instead, email **{{SECURITY_EMAIL}}** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive a response within **48 hours** acknowledging receipt.

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
| Older   | No        |

## Security Best Practices

This template enforces security through:

- **CI Pipeline**: Automated `npm audit --audit-level=high` on every PR
- **Dependabot**: Weekly automatic dependency updates
- **Security Tests**: Playwright-based security test suite (headers, XSS, auth bypass, CSRF, IDOR)
- **RLS / Auth**: Backend security policies documented in `.agent/rules/core-rules.md`
- **Zero Secrets**: No credentials in committed files — enforced by rules, PR checklist, and automated scanning (below)

## Secret Scanning (Zero Secrets)

The rule "ZERO sensitive data in committed files" (`.agent/rules/core-rules.md`) is enforced at three layers:

1. **Prevention — enable GitHub Secret Scanning + Push Protection** (recommended, zero config):
   `Settings > Code security and analysis` → enable **Secret scanning** and **Push protection**.
   Push protection **blocks the push** if a secret is detected — the cheapest, strongest gate.
   (Free on public repos; requires GitHub Advanced Security on private repos.)
2. **CI gate — Gitleaks** (`.github/workflows/ci.yml`, `secret-scan` job): scans the full git
   history on every push/PR. Runs even on the bare template. Fallback for private repos without GHAS.
   **Note:** on **organization-owned** repos `gitleaks-action` needs a free `GITLEAKS_LICENSE`
   (set it as a secret and uncomment the env line in `ci.yml`); personal repos need nothing.
   For orgs on GHAS, the zero-config Push Protection above is preferred.
3. **Human — PR checklist** (`.github/pull_request_template.md`) and `/review`.

If a secret is ever committed: **rotate it immediately** (assume it is compromised), then purge it
from history (`git filter-repo` / BFG). Removing it from `HEAD` alone is not enough.
