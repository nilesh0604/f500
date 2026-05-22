# Local Testing with Real AWS Services

This guide explains how to run the Vyasa RAG service locally using **real AWS services** (Bedrock, DynamoDB, S3).

## Prerequisites

1. AWS CLI configured with credentials
2. Bedrock Knowledge Base created and populated
3. DynamoDB tables created
4. S3 bucket for prompts (optional)

## Setup

### 1. Configure AWS Credentials

Option A - Use AWS CLI profile (recommended):

```bash
aws configure
# or use a specific profile
export AWS_PROFILE=your-profile-name
```

Option B - Use environment variables:

```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=us-east-1
```

### 2. Configure Environment Variables

```bash
cp .env.local.example .env.local
# Edit .env.local with your values
```

Required variables in `.env.local`:

```env
BEDROCK_KB_ID=your_kb_id_here
SESSIONS_TABLE=vyasa-rag-sessions-dev
RATE_LIMITS_TABLE=vyasa-rag-rate-limits-dev
```

### 3. Start the Local Server

```bash
./scripts/start-local.sh
```

The server will:

- Load `.env.local` automatically
- Connect to real AWS services
- Run on http://localhost:3000

## Testing Endpoints

### Health Check

```bash
curl http://localhost:3000/health
```

### Chat (Non-streaming)

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Who was Karna?", "session_id": "test-session-1"}'
```

### Chat (Streaming/SSE)

```bash
curl -X POST http://localhost:3000/chat/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"message": "Who was Karna?"}'
```

## AWS Costs Warning

⚠️ **Running with real AWS services will incur costs**:

- **Bedrock**: $0.003 per 1K input tokens, $0.015 per 1K output tokens (Claude 3 Sonnet)
- **DynamoDB**: On-demand pricing ~$1.25 per million writes, $0.25 per million reads
- **S3**: ~$0.023 per GB-month

For development, costs are typically minimal (<$1/day for light testing).

## Troubleshooting

### "BEDROCK_KB_ID not set"

Create a Knowledge Base in AWS Bedrock and copy the ID to `.env.local`.

### "No credentials found"

Run `aws configure` or set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

### "Resource not found" errors

Ensure the DynamoDB tables and S3 buckets exist in your AWS account.

## Using Mock Services (Alternative)

If you want to test without AWS costs, the Jest unit tests use mocks:

```bash
npx nx test vyasa-rag-service
```
