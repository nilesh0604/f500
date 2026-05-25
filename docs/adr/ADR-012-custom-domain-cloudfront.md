# ADR-012: Custom Domain Configuration for Vyasa UI (CloudFront + ACM)

- **Date:** 2026-05-25
- **Status:** Accepted
- **Author:** Nilesh Shinde

---

## Context

The Vyasa Intelligence UI was served via an auto-generated CloudFront domain
(`dmz5l917whhxp.cloudfront.net` — `OrderFlow-Prod-VyasaUi` stack). The goal
was to serve it under a human-readable custom domain: `vyasa.nshinde.xyz`.

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
| **CloudFront Domain**          | `d3qhic431njv7c.cloudfront.net`                                                           |
| **ACM Certificate ARN**        | `arn:aws:acm:us-east-1:947612421212:certificate/64cc200e-74df-45d3-b7d9-86b5ef3379e1`     |
| **S3 UI Bucket**               | `orderflow-vyasaui-vyasauibucket7b9068a5-tq2pu70x2k0y`                                    |
| **S3 Access Logs Bucket**      | auto-named (in `OrderFlow-VyasaUi` stack)                                                 |
| **CloudFront Function**        | `vyasa-api-rewrite-prod-v2` (rewrites `/api/*` → `/*`)                                    |
| **API Origin**                 | `https://no24fwwtcl.execute-api.us-east-1.amazonaws.com` (from `OrderFlow-Prod-VyasaRag`) |

### Legacy Resources (Orphaned — do not delete)

| Resource                    | Value                                            | Notes                                            |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| Old CloudFront Distribution | `EP41R330H10K2` / `dmz5l917whhxp.cloudfront.net` | Owned by `OrderFlow-Prod-VyasaUi` — still active |
| Old S3 UI Bucket            | `vyasa-ui-prod-947612421212`                     | Has live content, RETAIN policy                  |
| Old S3 Logs Bucket          | `vyasa-ui-access-logs-prod-947612421212`         | RETAIN policy                                    |
| Old Log Group               | `/vyasa/ui-deploy-prod`                          | Orphaned                                         |
| Old CF Function             | `vyasa-api-rewrite-prod`                         | Owned by `OrderFlow-Prod-VyasaUi`                |

---

## DNS Configuration (Namecheap — nshinde.xyz)

### Active Records

| Type  | Host                                      | Value                                                              | Purpose                                        |
| ----- | ----------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- |
| CNAME | `_14f04e88e165485e51aa0b9af8aeb5b8.vyasa` | `_0d85c2002378ec778375dfa887c2be0e.jkddzztszm.acm-validations.aws` | ACM DNS validation (permanent — do not delete) |
| CNAME | `vyasa`                                   | `d3qhic431njv7c.cloudfront.net`                                    | Points `vyasa.nshinde.xyz` → CloudFront        |

### Original Records (restore if needed)

| Type         | Host  | Value                       | Purpose                                      |
| ------------ | ----- | --------------------------- | -------------------------------------------- |
| CNAME        | `www` | `parkingpage.namecheap.com` | Namecheap parking page for `www.nshinde.xyz` |
| URL Redirect | `@`   | `http://www.nshinde.xyz/`   | Root domain redirect                         |

---

## CDK Code Changes

### `infra/config/environments.ts`

- Added `vyasaDomainName?: string` to `EnvironmentConfig` interface
- Set `vyasaDomainName: 'vyasa.nshinde.xyz'` in prod config

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
aws s3 sync s3://vyasa-ui-prod-947612421212 \
  s3://orderflow-vyasaui-vyasauibucket7b9068a5-tq2pu70x2k0y \
  --region us-east-1

aws cloudfront create-invalidation \
  --distribution-id EP5RB7V8B8LOQ \
  --paths "/*" \
  --region us-east-1
```

---

## Access URLs

| URL                                     | Status  | Notes                                                                 |
| --------------------------------------- | ------- | --------------------------------------------------------------------- |
| `https://vyasa.nshinde.xyz`             | ✅ Live | Custom domain — may be blocked by org DNS policy on corporate devices |
| `https://d3qhic431njv7c.cloudfront.net` | ✅ Live | New distribution — use for testing on corp devices                    |
| `https://dmz5l917whhxp.cloudfront.net`  | ✅ Live | Old distribution (`OrderFlow-Prod-VyasaUi`) — still active            |

---

## Known Issues

### Stack Naming Migration

The stack was renamed from `OrderFlow-Prod-VyasaUi` → `OrderFlow-VyasaUi` as
part of the single-env simplification (ADR-011). The old stack (`OrderFlow-Prod-VyasaRag`,
`OrderFlow-Prod-VyasaVector`) remains active. The new `OrderFlow-VyasaUi` stack
references the old RAG API endpoint directly until `OrderFlow-VyasaRag` is
redeployed under the new naming convention.

### Corporate DNS Blocking

`.xyz` TLD domains may be blocked by corporate/org DNS policy. Use the
CloudFront domain (`d3qhic431njv7c.cloudfront.net`) for testing on managed
devices. The custom domain works correctly on personal devices and mobile.
