# ADR-012: Custom Domain Configuration for Vyasa UI (CloudFront + ACM)

- **Date:** 2026-05-25
- **Updated:** 2026-05-31 — migration complete, orphaned resources cleaned up
- **Status:** Accepted
- **Author:** Nilesh Shinde

---

## Context

The Vyasa Intelligence UI was served via an auto-generated CloudFront domain
(`dmz5l917whhxp.cloudfront.net` — `OrderFlow-Prod-VyasaUi` stack). The goal
was to serve it under a human-readable custom domain: `<VYASA_DOMAIN>`.

Domain `nshinde.xyz` was purchased from Namecheap.

---

## Decision

Use CloudFront Alternate Domain Names (CNAMEs) with an ACM certificate for
HTTPS. The certificate is created inside the CDK stack (`VyasaUiStack`) and
validated via DNS (CNAME record in Namecheap).

---

## Infrastructure Summary

### AWS Resources

| Resource                       | Value                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| **Stack**                      | `OrderFlow-VyasaUi` (region: `us-east-1`)                                                 |
| **CloudFront Distribution ID** | `EP5RB7V8B8LOQ`                                                                           |
| **CloudFront Domain**          | `d2j5xbveesoc8s.cloudfront.net`                                                           |
| **ACM Certificate ARN**        | `arn:aws:acm:us-east-1:<AWS_ACCOUNT_ID>:certificate/64cc200e-74df-45d3-b7d9-86b5ef3379e1` |
| **S3 UI Bucket**               | `orderflow-vyasaui-vyasauibucket7b9068a5-tq2pu70x2k0y`                                    |
| **S3 Access Logs Bucket**      | auto-named (in `OrderFlow-VyasaUi` stack)                                                 |
| **CloudFront Function**        | `vyasa-api-rewrite-prod-v2` (rewrites `/api/*` → `/*`)                                    |
| **API Origin**                 | `https://no24fwwtcl.execute-api.us-east-1.amazonaws.com` (from `OrderFlow-Prod-VyasaRag`) |

### Legacy Resources (Cleaned Up — 2026-05-31)

All orphaned resources from the old `OrderFlow-Prod-VyasaUi` stack have been deleted.

| Resource                    | Value                                            | Status                       |
| --------------------------- | ------------------------------------------------ | ---------------------------- |
| Old CloudFront Distribution | `EP41R330H10K2` / `dmz5l917whhxp.cloudfront.net` | ✅ Deleted (stack destroyed) |
| Old S3 UI Bucket            | `vyasa-ui-prod-<AWS_ACCOUNT_ID>`                 | ✅ Emptied and deleted       |
| Old S3 Logs Bucket          | `vyasa-ui-access-logs-prod-<AWS_ACCOUNT_ID>`     | ✅ Already gone              |
| Old Log Group               | `/vyasa/ui-deploy-prod`                          | ✅ Already gone              |
| Old CF Function             | `vyasa-api-rewrite-prod`                         | ✅ Already gone              |
| Old Stack                   | `OrderFlow-Prod-VyasaUi`                         | ✅ Already destroyed         |

---

## DNS Configuration (Namecheap — nshinde.xyz)

### Active Records

| Type  | Host                                      | Value                                                              | Purpose                                        |
| ----- | ----------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- |
| CNAME | `_14f04e88e165485e51aa0b9af8aeb5b8.vyasa` | `_0d85c2002378ec778375dfa887c2be0e.jkddzztszm.acm-validations.aws` | ACM DNS validation (permanent — do not delete) |
| CNAME | `vyasa`                                   | `d2j5xbveesoc8s.cloudfront.net`                                    | Points `<VYASA_DOMAIN>` → CloudFront           |

### Original Records (restore if needed)

| Type         | Host  | Value                       | Purpose                                      |
| ------------ | ----- | --------------------------- | -------------------------------------------- |
| CNAME        | `www` | `parkingpage.namecheap.com` | Namecheap parking page for `www.nshinde.xyz` |
| URL Redirect | `@`   | `http://www.nshinde.xyz/`   | Root domain redirect                         |

---

## CDK Code Changes

### `infra/config/environments.ts`

- Added `vyasaDomainName?: string` to `EnvironmentConfig` interface
- Set `vyasaDomainName: '<VYASA_DOMAIN>'` in prod config

### `infra/lib/vyasa-ui-stack.ts`

- Added `domainName?: string` to `VyasaUiStackProps`
- Creates `acm.Certificate` with DNS validation when `domainName` is provided
- Attaches `domainNames` + `certificate` to the CloudFront distribution
- Renamed CF Function to `vyasa-api-rewrite-prod-v2` (avoids conflict with old stack)
- Renamed log group to `/vyasa/ui-deploy-prod-v2` (avoids conflict with orphaned resource)
- Removed fixed `bucketName` from both S3 buckets (avoids conflict with orphaned buckets)
- Access logs bucket and log group use `RemovalPolicy.RETAIN`

### `infra/bin/app.ts`

- Passes `domainName: config.vyasaDomainName` to `VyasaUiStack`
- API endpoint hardcoded to `https://no24fwwtcl.execute-api.us-east-1.amazonaws.com`
  (bypasses missing `OrderFlow-VyasaRag` cross-stack export — `OrderFlow-Prod-VyasaRag` is the active stack)

---

## Deploy Command

```bash
cd infra
AWS_DEFAULT_REGION=us-east-1 CDK_DEFAULT_REGION=us-east-1 \
  npx cdk deploy OrderFlow-VyasaUi --exclusively --require-approval never
```

> **Note:** `CDK_DEFAULT_REGION` must be set explicitly. AWS CLI default region
> on this machine is `us-east-2`, but all Vyasa stacks and the ACM certificate
> (required by CloudFront) must be in `us-east-1`.

## Sync UI Assets

If the S3 bucket is empty after a fresh stack deploy, sync from the old bucket:

```bash
aws s3 sync s3://vyasa-ui-prod-<AWS_ACCOUNT_ID> \
  s3://orderflow-vyasaui-vyasauibucket7b9068a5-tq2pu70x2k0y \
  --region us-east-1

aws cloudfront create-invalidation \
  --distribution-id EP5RB7V8B8LOQ \
  --paths "/*" \
  --region us-east-1
```

---

## Access URLs

| URL                                     | Status     | Notes                                                             |
| --------------------------------------- | ---------- | ----------------------------------------------------------------- |
| `https://<VYASA_DOMAIN>`                | ✅ Live    | Custom domain (external users) — may be blocked by org DNS policy |
| `https://d2j5xbveesoc8s.cloudfront.net` | ✅ Live    | CloudFront direct — use for dev/testing on corp devices           |
| `https://dmz5l917whhxp.cloudfront.net`  | ❌ Deleted | Old distribution — cleaned up 2026-05-31                          |

---

## FAQ

### Why did the CloudFront domain change from `dmz5l917whhxp` to `d2j5xbveesoc8s`?

This was a **one-time event** caused by renaming the CDK stack from
`OrderFlow-Prod-VyasaUi` → `OrderFlow-VyasaUi` (ADR-011 single-env
simplification). CDK treats a stack rename as a new stack — it creates all
resources fresh, including a new CloudFront distribution with a new auto-assigned
domain. **This will not happen again** on normal deployments; CDK tracks the
existing distribution via its logical ID and reuses it.

Future deploys only update assets in-place (S3 sync + CloudFront invalidation).
The domain `d2j5xbveesoc8s.cloudfront.net` is stable.

### Will new resources be created on every `release`?

No. The release script does **not** create new AWS resources. It:

1. Syncs built UI assets to the existing S3 bucket
2. Invalidates the existing CloudFront distribution
3. Runs `cdk deploy` which is idempotent — CloudFormation updates in-place or
   does nothing if there are no changes

New resources would only be created if the CDK stack were destroyed and
recreated, which requires explicit manual intervention.

---

## Known Issues (Resolved)

### Stack Naming Migration — RESOLVED 2026-05-31

The stack was renamed from `OrderFlow-Prod-VyasaUi` → `OrderFlow-VyasaUi` as
part of ADR-011. The migration is complete. All orphaned resources from the old
stack have been deleted. The active stack is `OrderFlow-VyasaUi` in `us-east-1`.

### Corporate DNS Blocking

`.xyz` TLD domains may be blocked by corporate/org DNS policy. Use the
CloudFront domain (`d2j5xbveesoc8s.cloudfront.net`) for dev/testing on managed
devices. The custom domain (`<VYASA_DOMAIN>`) works correctly on personal
devices and mobile — reserve it for external users.
