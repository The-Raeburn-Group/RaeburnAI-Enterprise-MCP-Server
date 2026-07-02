# Security Policy

## Supported versions

Security fixes are applied to the latest `main` branch until the first stable release. After `v1.0.0`, supported release lines will be listed here.

## Reporting a vulnerability

Please do not open a public GitHub issue for sensitive vulnerabilities.

Email the maintainers or use GitHub private vulnerability reporting if enabled. Include:

- Affected version or commit
- Connector involved
- Impact
- Reproduction steps
- Suggested fix, if known

## Security expectations

This server is designed for enterprise use and should be deployed with:

- Least-privilege OAuth scopes
- Separate service accounts per environment
- Secret manager backed runtime configuration
- Write-action approval enabled
- Audit logging enabled
- Network egress controls where possible

## Out of scope

Misconfiguration, leaked local `.env` files, and excessive third-party API permissions are outside the project maintainers' control, but the project includes guardrails and documentation to reduce risk.
