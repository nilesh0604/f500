#!/bin/bash
#
# Start local development server for Vyasa RAG
# Usage: ./scripts/start-local.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$PROJECT_ROOT"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Starting Vyasa RAG local development server...${NC}"

# Check if ts-node is available
if ! command -v npx &> /dev/null; then
    echo "Error: npx not found. Please install Node.js."
    exit 1
fi

# Install dependencies if needed
if [ ! -d "../../node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    cd ../..
    npm install
    cd "$PROJECT_ROOT"
fi

# Load environment variables from .env.local if it exists
if [ -f .env.local ]; then
    echo -e "${YELLOW}Loading environment from .env.local...${NC}"
    set -a
    source .env.local
    set +a
fi

# Set defaults
export NODE_ENV=development
export AWS_REGION=${AWS_REGION:-us-east-1}
export MAX_AGENT_ITERATIONS=${MAX_AGENT_ITERATIONS:-3}
export SESSION_TTL_DAYS=${SESSION_TTL_DAYS:-7}

# Check for required AWS credentials
if [ -z "$AWS_ACCESS_KEY_ID" ] && [ -z "$AWS_PROFILE" ]; then
    echo -e "${YELLOW}⚠️  AWS credentials not found in environment${NC}"
    echo -e "${YELLOW}   Using default AWS profile or IAM role${NC}"
fi

# Check for required Bedrock KB ID
if [ -z "$BEDROCK_KB_ID" ]; then
    echo -e "${YELLOW}⚠️  BEDROCK_KB_ID not set${NC}"
    echo -e "${YELLOW}   Set it in .env.local or export it${NC}"
fi

# Info about AWS services
echo -e "${GREEN}✓ Using REAL AWS services:${NC}"
echo -e "${GREEN}  - Region: $AWS_REGION${NC}"
echo -e "${GREEN}  - Bedrock KB ID: ${BEDROCK_KB_ID:-'NOT SET'}${NC}"
echo ""

# Start the server
echo -e "${GREEN}Starting server...${NC}"
npx ts-node src/local-server.ts
