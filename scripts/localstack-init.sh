#!/bin/bash
# LocalStack initialization script
# Creates AWS resources (SQS queues, EventBridge rules) for local development

set -e

echo "=== Initializing LocalStack AWS Resources ==="

# Configure AWS CLI for LocalStack
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_DEFAULT_OUTPUT=json

# Wait for LocalStack to be ready
echo "Waiting for LocalStack to be ready..."
until curl -s http://localhost:4566/_localstack/health > /dev/null 2>&1; do
  sleep 1
done

echo "LocalStack is ready. Creating resources..."

# Create SQS Queue for notifications
echo "Creating SQS Queue: orderflow-notifications"
awslocal sqs create-queue \
  --queue-name orderflow-notifications \
  --attributes '{
    "VisibilityTimeout": "30",
    "MessageRetentionPeriod": "86400",
    "ReceiveMessageWaitTimeSeconds": "20"
  }'

# Create Dead Letter Queue
echo "Creating SQS Queue: orderflow-notifications-dlq"
awslocal sqs create-queue \
  --queue-name orderflow-notifications-dlq \
  --attributes '{
    "MessageRetentionPeriod": "1209600"
  }'

# Create EventBridge Event Bus
echo "Creating EventBridge Event Bus: orderflow-event-bus"
awslocal events create-event-bus \
  --name orderflow-event-bus

# Create EventBridge Rule for Order Events
echo "Creating EventBridge Rule: order-events-rule"
awslocal events put-rule \
  --name order-events-rule \
  --event-bus-name orderflow-event-bus \
  --event-pattern '{
    "source": ["orderflow.order-service"]
  }' \
  --state ENABLED

# Get queue ARN
QUEUE_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/orderflow-notifications \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)

# Create EventBridge Target to send events to SQS
echo "Creating EventBridge Target to SQS"
awslocal events put-targets \
  --rule order-events-rule \
  --event-bus-name orderflow-event-bus \
  --targets '[{
    "Id": "1",
    "Arn": "'$QUEUE_ARN'"
  }]' || true

# Create Secrets Manager secret for JWT keys (dummy values for local dev)
echo "Creating Secrets Manager secret: orderflow/jwt-keys"
awslocal secretsmanager create-secret \
  --name orderflow/jwt-keys \
  --description "JWT signing keys for OrderFlow" \
  --secret-string '{
    "privateKey": "-----BEGIN RSA PRIVATE KEY-----\nMIIEpQIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----",
    "publicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----"
  }' || true

echo "=== LocalStack initialization complete ==="
echo ""
echo "Created resources:"
echo "  - SQS Queue: orderflow-notifications"
echo "  - SQS Queue: orderflow-notifications-dlq (DLQ)"
echo "  - EventBridge Event Bus: orderflow-event-bus"
echo "  - EventBridge Rule: order-events-rule"
echo "  - Secrets Manager: orderflow/jwt-keys"
