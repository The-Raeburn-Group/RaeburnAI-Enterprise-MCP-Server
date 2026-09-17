# Software supply-chain policy

## Purpose

RaeburnAI Enterprise MCP treats build and release provenance as a production security boundary. A release is not considered trusted merely because source code is present in GitHub or a container builds successfully.

## Required controls

All third-party GitHub Actions used by repository workflows must be pinned to a full 40-character commit SHA. Mutable tags such as `@v4`, `@main`, or branch names are rejected by `npm run validate:supply-chain`.

Pull-request and main-branch CI must use the lockfile with `npm ci`, run the supply-chain validator, fail on High/Critical dependency findings, build the production container using the exact Git commit SHA as its image tag, and fail on High/Critical container-image findings.

Version-tag releases must repeat the quality, dependency, build, and container gates before producing release assets. A release trust package must contain:

- a source/build archive tied to the version tag;
- SHA-256 checksums;
- SPDX and CycloneDX SBOMs;
- keyless Sigstore signature bundles;
- GitHub provenance and SBOM attestations; and
- a verification guide published with the release.

## Remediation expectations

Critical supply-chain vulnerabilities block release and should be investigated immediately. High-severity findings also block release until remediated or an explicit, time-bounded security exception is approved and recorded outside the build itself. Medium and lower findings are reviewed according to exploitability, exposure, and upstream remediation availability.

The repository must not weaken the High/Critical release gates merely to obtain a green build. If an upstream package or base image prevents remediation, the release remains blocked until the dependency is replaced, upgraded, isolated, or a formally governed exception is approved.

## Verification

Run locally:

```sh
npm ci
npm run validate:supply-chain
npm audit --audit-level=high
npm run check
npm run build
```

Container vulnerability evidence is produced by CI because it depends on the built commit-SHA image. Release signing and GitHub attestations are produced only from version-tag workflows using GitHub OIDC; no long-lived signing key is required in the repository.
