# Vyasa RAG Service - Deployment Guide

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 22+ installed
- AWS CDK CLI installed (`npm install -g aws-cdk`)

## Deployment Steps

### 1. Install Dependencies

```bash
cd /Users/Nilesh_Shinde/iSpace/f500
npm install
```

**Status:** ✅ Complete

### 2. Build Lambda Function

```bash
npx nx build vyasa-rag-service
```

This compiles TypeScript and creates the Lambda bundle at `dist/apps/vyasa-rag-service/`.

**Status:** ⚠️ Build configuration added, run manually

### 3. Deploy Infrastructure (CDK)

```bash
cd infra

# Bootstrap (one-time setup)
npx cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1

# Deploy to dev
npx cdk deploy OrderFlow-Dev-VyasaRag --require-approval never

# Deploy to staging
npx cdk deploy OrderFlow-Staging-VyasaRag --require-approval never

# Deploy to production
npx cdk deploy OrderFlow-Prod-VyasaRag --require-approval never
```

**Creates:**

- Lambda function with Function URL
- DynamoDB tables (sessions, rate-limits)
- S3 buckets (corpus, prompts)
- IAM roles and policies
- CloudWatch alarms

**Status:** ⚠️ Deploy manually

### 4. Populate Bedrock Knowledge Base

**Option A: Using the script**

```bash
cd apps/vyasa-rag-service

# Set environment variables
export CORPUS_BUCKET=vyasa-rag-corpus-dev
export BEDROCK_KB_ID=your-kb-id-here

# Run population script
./scripts/populate-kb.sh
```

**Option B: Manual steps**

1. Go to AWS Console → Amazon Bedrock → Knowledge Bases
2. Create new Knowledge Base (or use existing)
3. Add S3 data source: `s3://vyasa-rag-corpus-dev/mahabharata/`
4. Start sync

**Status:** ✅ Script created, run manually

### 5. Configure Environment Variables

The Lambda function needs these environment variables:

```bash
BEDROCK_KB_ID=your-kb-id
BEDROCK_MODEL_ARN=arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0
SESSIONS_TABLE=vyasa-rag-sessions-dev
RATE_LIMITS_TABLE=vyasa-rag-rate-limits-dev
PROMPTS_BUCKET=vyasa-rag-prompts-dev
MAX_AGENT_ITERATIONS=3
SESSION_TTL_DAYS=7
```

Set these in the Lambda console or via CDK.

### 6. Test Deployment

```bash
# Health check
curl https://your-function-url.lambda-url.us-east-1.on.aws/health

# Chat test
curl -X POST https://your-function-url.lambda-url.us-east-1.on.aws/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Who was Karna?"}'
```

### 7. Enable Monitoring

```bash
# Import CloudWatch dashboard
aws cloudwatch put-dashboard \
  --dashboard-name VyasaRAG-Dev \
  --dashboard-body file://apps/vyasa-rag-service/infra/observability/dashboard.json

# Set up SNS topic for alarms
aws sns create-topic --name vyasa-rag-alerts
```

## Troubleshooting

### Build Errors

**Error: `ENOENT: no such file or directory, stat 'src/assets'`**

- Solution: `mkdir -p apps/vyasa-rag-service/src/assets`

**Error: `Using "isolatedConfig" without a "webpackConfig" is not supported`**

- Solution: Added `webpack.config.js` and updated `project.json`

**Error: `Cannot find module '@orderflow/shared-types/rag'`**

- Solution: Added `libs/shared-types/package.json` with proper exports

### Deployment Errors

**Error: `Stack does not exist`**

- Run `cdk bootstrap` first

**Error: `API rate limit exceeded`**

- Wait a few minutes and retry

### Knowledge Base Issues

**Sync fails**

- Check S3 bucket permissions
- Verify file format (text files work best)
- Check chunk size (smaller chunks = better retrieval)

**No results from queries**

- Verify KB ID in Lambda env vars
- Check data source is synced
- Test with simple queries first

## Cost Estimates

| Component              | Monthly Cost |
| ---------------------- | ------------ |
| Lambda (1K requests)   | ~$0.50       |
| Bedrock (Claude Haiku) | ~$2.00       |
| DynamoDB (on-demand)   | ~$1.00       |
| S3 (1GB)               | ~$0.02       |
| CloudWatch             | ~$1.00       |
| **Total**              | **~$5-10**   |

## CI/CD

GitHub Actions workflows are configured:

- **CI**: Runs on PR/push (lint, test, build)
- **CD**: Deploys to staging → runs evaluation → deploys to prod
- **Eval**: Daily evaluation with pass rate checks

## Support

For issues:

1. Check CloudWatch logs: `/aws/lambda/vyasa-rag-service`
2. Review X-Ray traces
3. Check CloudWatch dashboard
4. Review evaluation results

## Next Steps

After deployment:

1. ✅ Run smoke tests
2. ✅ Run golden dataset evaluation
3. ✅ Enable CloudWatch alarms
4. ✅ Set up feedback collection
5. ✅ Monitor cost and usage
