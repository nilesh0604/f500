# F500 Enterprise Action Items

> Tracks gaps between current state and Fortune 500 enterprise production-grade standards.
> Updated whenever a workaround is introduced or an existing gap is closed.

---

## Security & Secrets

### [CLOSED] Langfuse API keys committed in `.env.local.example`

- **Enterprise-standard practice**: Example/template env files must contain only placeholder values, never real credentials. Secrets should be distributed via AWS Secrets Manager or a secure vault.
- **Workaround shipped**: Replaced real Langfuse keys (`sk-lf-...`, `pk-lf-...`, base64 MCP auth) with placeholders in `apps/vyasa-rag-service/.env.local.example`.
- **Reasoning**: The file was an example template that accidentally contained real keys instead of placeholders.
- **Future action item**: **Revoke the leaked Langfuse keys immediately** at https://cloud.langfuse.com → Project Settings → API Keys. Regenerate new keys and store them in AWS Secrets Manager or local `.env.local` (gitignored).

### [CLOSED] EPAM CodeMie internal URL in SCRUM-21 feature docs

- **Enterprise-standard practice**: Internal employer infrastructure URLs must never appear in personal/portfolio repositories.
- **Workaround shipped**: Removed the auto-generated CodeMie agent metadata headers (containing `codemie.lab.epam.com`, EPAM profile name, session UUIDs) from all 7 SCRUM-21 feature docs.
- **Reasoning**: These headers were auto-injected by the CodeMie CLI agent and leaked EPAM-internal infrastructure details.
- **Future action item**: Configure the CodeMie CLI to omit metadata headers when exporting to external repos, or strip headers before committing.

---

## Personal Information

### [CLOSED] Personal domain hardcoded in infra config

- **Enterprise-standard practice**: Environment-specific configuration (domains, account IDs, endpoints) should be externalized to environment variables or SSM Parameter Store, not hardcoded in source.
- **Workaround shipped**: Changed `vyasaDomainName` in `infra/config/environments.ts` from hardcoded `'vyasa.nshinde.xyz'` to `process.env.VYASA_DOMAIN_NAME ?? ''`. Replaced all doc references with `<VYASA_DOMAIN>` placeholder.
- **Reasoning**: The domain is the actual production endpoint but is personally identifying. Externalizing to env var follows the same pattern already used for `CDK_DEFAULT_ACCOUNT`.
- **Future action item**: Set `VYASA_DOMAIN_NAME` in the CDK deployment environment (e.g. `~/.aws/profile` or CI env vars). Consider migrating to AWS SSM Parameter Store for centralized config management.

### [CLOSED] Personal Jira site URL hardcoded in CLI fallback

- **Enterprise-standard practice**: CLI tools should require explicit configuration via env vars, not default to a personal instance.
- **Workaround shipped**: Removed the hardcoded `https://nilesh0604.atlassian.net` fallback in `scripts/ai-dev/cli.ts`. The CLI now throws an error if `JIRA_BASE_URL` is not set. Updated `CLAUDE.md` to reference `<JIRA_SITE>` placeholder.
- **Reasoning**: Hardcoded personal URLs in CLI fallbacks expose personal info and couple the tool to a specific instance.
- **Future action item**: Document required env vars (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) in the ai-dev CLI README.

### [CLOSED] AWS Account ID in tracked files

- **Enterprise-standard practice**: AWS account IDs should not be hardcoded in source-controlled files. Use `CDK_DEFAULT_ACCOUNT` or env vars for CDK, and placeholders in documentation.
- **Workaround shipped**: Replaced `947612421212` with `<AWS_ACCOUNT_ID>` in all doc files (CHANGELOG, INFRASTRUCTURE.md, ADR-012, IMPLEMENTATION_PLAN, AI_DRIVEN_DEV_SETUP, disabled workflow). Untracked `infra/cdk.context.json` (auto-generated CDK cache) and added it to `.gitignore`.
- **Reasoning**: Account IDs are not secrets but are personally identifying and can be used for target enumeration.
- **Future action item**: Ensure `cdk.context.json` is not re-added to git. Consider adding a pre-commit hook to scan for account IDs.

---

## Summary of Changes (2026-08-27)

| Finding                                   | Severity | Status | Files Changed   |
| ----------------------------------------- | -------- | ------ | --------------- |
| Langfuse API keys in `.env.local.example` | HIGH     | CLOSED | 1               |
| EPAM CodeMie URL in SCRUM-21 docs         | HIGH     | CLOSED | 7               |
| Personal domain in infra config           | MEDIUM   | CLOSED | 11+             |
| Personal Jira URL in CLI                  | MEDIUM   | CLOSED | 2               |
| AWS Account ID in tracked files           | MEDIUM   | CLOSED | 7 + 1 untracked |
