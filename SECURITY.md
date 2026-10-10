# Security policy

## Supported versions

| Version | Supported |
|---|---|
| latest 0.x release | yes |
| older releases | no |

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting: open the repository's **Security**
tab and choose **Report a vulnerability**. Include the Rosetta version, the steps to reproduce and, if it involves an
analysed repository, a minimal example.

You will get an answer within 7 days. Fixes are released as a patch version and credited in the release notes unless
you prefer otherwise.

## Scope

In scope:

- Prompt injection from an analysed repository that makes Rosetta act outside its read-only tools, leak data to a
  provider, or publish content it should not.
- Script or markup from an analysed repository or a model that runs in the web application or the published report.
- Archive handling (path traversal, links, size), requests to hosts other than GitHub and the configured providers.
- Signing in without valid credentials, using another user's session, or bypassing lockout, rate limits or CSRF
  protection.
- Reading or changing another user's projects, runs, files or provider keys, or reaching an administrator function
  as a normal user.
- Spending the server's provider keys beyond the configured caps.
- Recovering a stored provider key, password or session id from the database, a response or a log.
- Secrets reaching a provider, a log, a transcript or a published report.

Out of scope: vulnerabilities in the analysed repositories themselves, in model providers, on a machine that is
already compromised, or in the hosting provider's own platform.

The threat model is in [docs/security/threat-model.md](docs/security/threat-model.md).
