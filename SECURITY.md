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
- Enforced connector egress/data-residency policy
- Network egress controls where possible

## Tool data egress and residency boundary

Authenticated Chain HTTP tool execution can enforce an explicit destination policy before any connector receives the tool payload. Chain supplies the trusted effective data sensitivity through `x-raeburn-data-sensitivity`; MCP does not read that classification from connector-controlled or ordinary tool input.

`TOOL_EGRESS_POLICY` supports three modes:

- `local_only`: deny every connector classified outside the local boundary.
- `allow_list`: require both the connector and its declared region to be explicitly allowed.
- `allow_configured`: allow explicitly classified destinations, subject to the configured private/external sensitivity ceilings.

`CONNECTOR_EGRESS_CLASSIFICATIONS` maps connector names to a `local`, `private`, or `external` boundary plus a deployment region. A production tool invocation fails closed when the policy, trusted sensitivity, or connector destination classification needed for the decision is absent or invalid. Data above the relevant private/external sensitivity ceiling is denied before `executeEnterpriseTool`, so connector code and credentials are never reached for that request.

A configured region is an operational assertion, **not evidence by itself that a third-party provider physically stores or processes data only in that geography**. Release evidence must validate the declared region/residency against the actual provider plan, tenant configuration, contract and network path. Application policy enforcement and provider-residency verification remain separate controls.

## Untrusted connector content

All content returned by third-party tools, retrieved documents and upstream connector errors is treated as **untrusted external data**, never as a source of system, developer or user instructions. The execution layer:

- assigns external tool results `instructionAuthority: none`
- wraps model-facing text in an explicit untrusted-content delimiter
- carries machine-readable trust metadata over the Chain HTTP bridge
- detects common instruction-override, authority-impersonation, secret-exfiltration and tool-escalation patterns without deleting the underlying evidence
- records the content-security assessment in the audit trail
- keeps tool authorization, tenant identity and approval provenance outside connector-controlled output
- requires normal platform policy evaluation before any follow-on tool use even when no injection signal is detected
- sets `autonomousToolChaining: blocked` and `followOnToolAction: governed-review-required` when an injection signal is detected

Injection signals are warning evidence, not proof that content is malicious. The chaining decision is therefore deliberately conservative: hostile-looking external data stays available as evidence, but it cannot be treated as authority for another autonomous tool action. Downstream model/orchestration layers must preserve the `data-only` boundary, honor the machine-readable chaining decision and must not grant external content authority merely because no heuristic signal was detected.

### Prompt-injection evaluation baseline

The repository includes a versioned adversarial regression corpus at `tests/fixtures/prompt-injection-corpus.json`. Run `npm run test:security` to execute the content-boundary tests plus the corpus evaluation. The corpus includes hostile nested instructions, authority impersonation, secret-exfiltration attempts, tool-escalation attempts and benign near-misses. Every case verifies the resulting chaining decision in addition to signal detection.

This corpus is a regression baseline, not a claim of complete prompt-injection detection. Heuristics can produce false negatives or false positives. Production safety therefore continues to depend on the separate authority boundary, tenant/RBAC enforcement, approval policy, least-privilege credentials and downstream orchestration honoring the machine-readable chaining decision.

## Out of scope

Misconfiguration, leaked local `.env` files, and excessive third-party API permissions are outside the project maintainers' control, but the project includes guardrails and documentation to reduce risk.
