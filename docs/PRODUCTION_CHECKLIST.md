# Production Checklist

## Before launch

- [ ] Use organisation-owned OAuth apps and service accounts.
- [ ] Confirm each connector has least-privilege scopes.
- [ ] Configure only needed connectors with `ENABLED_CONNECTORS`.
- [ ] Configure `ALLOWED_TOOLS` for production allowlisting.
- [ ] Keep write approval enabled unless the MCP host has equivalent controls.
- [ ] Route logs to a secure log system.
- [ ] Verify logs redact secrets.
- [ ] Set up API rate-limit monitoring.
- [ ] Run `npm run check` and `npm run build` in CI.
- [ ] Build and scan the Docker image.
- [ ] Create an incident response process for credential rotation.

## Production secret delivery

Production must not place long-lived connector or service credentials directly in environment values or committed `.env` files. The MCP service supports a provider-neutral mounted-secret contract so the deployment layer can use a managed secret store without coupling application code to one cloud vendor.

For every sensitive variable, production uses the matching `*_FILE` variable. The referenced path must be absolute, readable as a regular file, non-empty and no larger than 64 KiB. Configuring both a direct secret and its `*_FILE` reference is rejected. The server resolves the file at startup and keeps the existing connector configuration interface internally.

This pattern is compatible with secret files projected by Kubernetes/Docker, Vault Agent and cloud secret-store CSI integrations. Selection and configuration of the actual managed secret service, KMS key policy and workload identity remain deployment responsibilities.

Sensitive production variables covered by this boundary:

- `RAEBURN_CHAIN_SERVICE_TOKEN_FILE`
- `GOOGLE_CLIENT_SECRET_FILE`
- `GOOGLE_REFRESH_TOKEN_FILE`
- `GITHUB_READ_TOKEN_FILE`
- `GITHUB_WRITE_TOKEN_FILE`
- `SLACK_BOT_TOKEN_FILE`
- `MICROSOFT_CLIENT_SECRET_FILE`
- `SALESFORCE_ACCESS_TOKEN_FILE`
- `HUBSPOT_ACCESS_TOKEN_FILE`
- `NOTION_TOKEN_FILE`
- `SUPABASE_SERVICE_ROLE_KEY_FILE`

`GITHUB_TOKEN` remains development-only compatibility and is rejected in production regardless of delivery method.

Before production:

- [ ] Select the managed secret store and KMS/encryption policy for the hosting environment.
- [ ] Give each MCP deployment/workload its own least-privilege secret-read identity rather than sharing operator credentials.
- [ ] Mount only the secret files needed by connectors enabled in `ENABLED_CONNECTORS`.
- [ ] Confirm no raw production value is supplied for a sensitive variable covered by the `*_FILE` boundary.
- [ ] Define independent rotation/revocation ownership for Chain service auth, Google, GitHub and every enabled SaaS connector.
- [ ] Test startup failure for a missing/empty secret mount and verify secrets do not appear in process arguments, logs or deployment manifests.

## Google Workspace OAuth

Use a Google Cloud project owned by the organisation rather than an individual's personal OAuth client. The current Google Workspace tools are intentionally read-only and the server validates the scopes on the **actual access token** returned by Google before making an API request.

Request only the scopes needed for the Google connectors enabled in `ENABLED_CONNECTORS`:

| Connector       | Required API scope                                        |
| --------------- | --------------------------------------------------------- |
| Gmail           | `https://www.googleapis.com/auth/gmail.readonly`          |
| Google Calendar | `https://www.googleapis.com/auth/calendar.readonly`       |
| Google Drive    | `https://www.googleapis.com/auth/drive.metadata.readonly` |

Identity-only scopes such as `openid`, `email`, `profile`, `https://www.googleapis.com/auth/userinfo.email` and `https://www.googleapis.com/auth/userinfo.profile` may also be present. Broader Google API scopes are rejected, including full Drive access and Gmail modification scopes. A read-only scope for a Google connector that is disabled is also rejected, so production tokens cannot silently retain access that the deployment no longer needs.

Before enabling Google Workspace in production:

- [ ] Create the OAuth consent screen and OAuth client in the organisation-owned Google Cloud project.
- [ ] Enable only the Gmail, Calendar and/or Drive APIs actually required by the deployment.
- [ ] Authorize only the exact read-only scopes listed above for connectors enabled in `ENABLED_CONNECTORS`.
- [ ] Store the client secret and refresh token in the selected production secret manager and expose them through `GOOGLE_CLIENT_SECRET_FILE` and `GOOGLE_REFRESH_TOKEN_FILE`; do not place them in source control or a committed `.env` file.
- [ ] Rotate/revoke the refresh token when connector access changes and issue a new token with the reduced scope set.
- [ ] Run a read-only pilot and confirm the MCP server rejects a deliberately over-scoped token.

## GitHub least privilege

Production GitHub access is split into independent read and write credentials. `GITHUB_TOKEN` is retained only for local/development compatibility and is rejected in production. Prefer a GitHub App installation token or fine-grained personal access token restricted to the exact repositories used by the deployment.

Read access:

- [ ] Create a fine-grained read token or GitHub App installation token with read-only permissions required by the enabled tools and mount it via `GITHUB_READ_TOKEN_FILE`.
- [ ] Set `GITHUB_ALLOWED_REPOSITORIES` to explicit `owner/repository` entries. Production refuses a configured read token without this allowlist.
- [ ] Confirm `github.search_repositories` returns only allowlisted repositories and `github.list_issues` rejects a lookalike or non-allowlisted repository.
- [ ] Confirm broad classic PAT/OAuth repository scopes such as `repo` or `public_repo` are rejected by the runtime.

Write access is a separate opt-in boundary:

- [ ] Leave `GITHUB_ENABLE_WRITES=false` for read-only pilots.
- [ ] When a write use case is approved, create a distinct write credential rather than reusing the read credential and mount it via `GITHUB_WRITE_TOKEN_FILE`.
- [ ] Set `GITHUB_WRITE_ALLOWED_REPOSITORIES` to the minimum subset of `GITHUB_ALLOWED_REPOSITORIES` that may receive writes.
- [ ] Grant only the fine-grained GitHub permission required by the write tool; for `github.create_issue`, do not grant unrelated repository administration or content-write permissions.
- [ ] Verify the Chain approval flow before enabling writes, then confirm a request outside the write allowlist is rejected before GitHub API execution.
- [ ] Rotate the read and write credentials independently.

## Connector review

| Connector        | Review item                                                            |
| ---------------- | ---------------------------------------------------------------------- |
| Google Workspace | OAuth consent screen, verified read-only scopes, refresh-token storage |
| GitHub           | Fine-grained/App tokens, repository allowlists, split read/write creds |
| Slack            | Bot scopes, channel visibility, posting guardrails                     |
| SharePoint       | Microsoft Graph application permissions                                |
| Salesforce       | Connected app policy and IP restrictions                               |
| HubSpot          | Private app scopes                                                     |
| Notion           | Integration page/database access                                       |
| Supabase         | Service role key storage and RLS posture                               |

## First production run

1. Start with read-only tools.
2. Run `enterprise.health`.
3. Test one connector at a time.
4. Confirm audit events are generated.
5. Add write tools only after approval flow validation.
