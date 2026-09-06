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
- [ ] Store `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN` in the selected production secret manager; do not place them in source control or a committed `.env` file.
- [ ] Rotate/revoke the refresh token when connector access changes and issue a new token with the reduced scope set.
- [ ] Run a read-only pilot and confirm the MCP server rejects a deliberately over-scoped token.

## GitHub least privilege

Production GitHub access is split into independent read and write credentials. `GITHUB_TOKEN` is retained only for local/development compatibility and is rejected in production. Prefer a GitHub App installation token or fine-grained personal access token restricted to the exact repositories used by the deployment.

Read access:

- [ ] Create `GITHUB_READ_TOKEN` as a fine-grained token or GitHub App installation token with read-only permissions required by the enabled tools.
- [ ] Set `GITHUB_ALLOWED_REPOSITORIES` to explicit `owner/repository` entries. Production refuses a configured read token without this allowlist.
- [ ] Confirm `github.search_repositories` returns only allowlisted repositories and `github.list_issues` rejects a lookalike or non-allowlisted repository.
- [ ] Confirm broad classic PAT/OAuth repository scopes such as `repo` or `public_repo` are rejected by the runtime.

Write access is a separate opt-in boundary:

- [ ] Leave `GITHUB_ENABLE_WRITES=false` for read-only pilots.
- [ ] When a write use case is approved, create a distinct `GITHUB_WRITE_TOKEN` rather than reusing the read credential.
- [ ] Set `GITHUB_WRITE_ALLOWED_REPOSITORIES` to the minimum subset of `GITHUB_ALLOWED_REPOSITORIES` that may receive writes.
- [ ] Grant only the fine-grained GitHub permission required by the write tool; for `github.create_issue`, do not grant unrelated repository administration or content-write permissions.
- [ ] Verify the Chain approval flow before enabling writes, then confirm a request outside the write allowlist is rejected before GitHub API execution.
- [ ] Store both credentials in the production secret manager and rotate them independently.

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
