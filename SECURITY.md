# Security Policy

## Scope

IELTS Workbench is a local-first desktop application. User workspaces and SQLite data must remain under an explicit user-selected boundary; API keys, when implemented, must not be stored in renderer code, local storage, logs or ordinary SQLite fields.

The detailed project security design is documented in [`docs/SECURITY.md`](docs/SECURITY.md).

## Reporting

Please do not publish credentials, private learning workspaces or exploitable vulnerabilities in a public issue. Once the GitHub repository is available, use a private GitHub Security Advisory or contact the repository maintainer privately.
