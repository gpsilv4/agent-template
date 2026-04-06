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
- **Zero Secrets**: No credentials in committed files — enforced by rules and PR checklist
