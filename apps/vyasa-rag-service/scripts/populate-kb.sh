#!/bin/bash
#
# Populate Bedrock Knowledge Base with Mahabharata corpus
# This script uploads the Mahabharata corpus to S3 and starts Bedrock KB sync
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BUCKET_NAME="${CORPUS_BUCKET:-vyasa-rag-corpus-dev}"
KB_ID="${BEDROCK_KB_ID:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"
CORPUS_SOURCE="${CORPUS_SOURCE:-https://raw.githubusercontent.com/karanshergill/Mahabharata/main/mahabharata.txt}"

echo "========================================"
echo "Vyasa RAG - Knowledge Base Population"
echo "========================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI not found${NC}"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq not found${NC}"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS credentials not configured${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"
echo ""

# Create S3 bucket if it doesn't exist
echo "Step 1: Checking S3 bucket..."
if ! aws s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
    echo "Creating bucket: $BUCKET_NAME"
    aws s3 mb "s3://$BUCKET_NAME" --region "$AWS_REGION"
    echo -e "${GREEN}✓ Bucket created${NC}"
else
    echo -e "${GREEN}✓ Bucket exists${NC}"
fi
echo ""

# Download Mahabharata corpus if not present
echo "Step 2: Preparing Mahabharata corpus..."
CORPUS_DIR="${SCRIPT_DIR}/../data/corpus"
mkdir -p "$CORPUS_DIR"

if [ ! -f "$CORPUS_DIR/mahabharata.txt" ]; then
    echo "Downloading Mahabharata corpus..."
    curl -L -o "$CORPUS_DIR/mahabharata.txt" "$CORPUS_SOURCE"
    echo -e "${GREEN}✓ Downloaded corpus${NC}"
else
    echo -e "${GREEN}✓ Corpus already downloaded${NC}"
fi

# Check file size
FILE_SIZE=$(du -h "$CORPUS_DIR/mahabharata.txt" | cut -f1)
echo "Corpus size: $FILE_SIZE"
echo ""

# Chunk the corpus for better retrieval
echo "Step 3: Chunking corpus..."
CHUNKS_DIR="${SCRIPT_DIR}/../data/chunks"
mkdir -p "$CHUNKS_DIR"

if [ ! -f "$CHUNKS_DIR/chunk-001.txt" ]; then
    echo "Splitting corpus into chunks (~1000 lines each)..."
    split -l 1000 "$CORPUS_DIR/mahabharata.txt" "$CHUNKS_DIR/chunk-" --numeric-suffixes=1 --suffix-length=3
    
    # Add metadata to each chunk
    for file in "$CHUNKS_DIR"/chunk-*; do
        chunk_num=$(basename "$file" | grep -o '[0-9]*')
        {
            echo "---"
            echo "source: mahabharata"
            echo "chunk_number: $chunk_num"
            echo "book: Adi Parva"
            echo "---"
            echo ""
            cat "$file"
        } > "${file}.tmp"
        mv "${file}.tmp" "$file"
    done
    
    CHUNK_COUNT=$(ls -1 "$CHUNKS_DIR"/chunk-* 2>/dev/null | wc -l)
    echo -e "${GREEN}✓ Created $CHUNK_COUNT chunks${NC}"
else
    CHUNK_COUNT=$(ls -1 "$CHUNKS_DIR"/chunk-* 2>/dev/null | wc -l)
    echo -e "${GREEN}✓ $CHUNK_COUNT chunks already exist${NC}"
fi
echo ""

# Upload chunks to S3
echo "Step 4: Uploading to S3..."
aws s3 sync "$CHUNKS_DIR/" "s3://$BUCKET_NAME/mahabharata/" --delete
CHUNKS_UPLOADED=$(aws s3 ls "s3://$BUCKET_NAME/mahabharata/" --recursive | wc -l)
echo -e "${GREEN}✓ Uploaded $CHUNKS_UPLOADED chunks${NC}"
echo ""

# Create metadata file
echo "Step 5: Creating metadata file..."
cat > "${SCRIPT_DIR}/../data/kb-metadata.json" << EOF
{
  "knowledgeBaseId": "${KB_ID}",
  "source": "mahabharata",
  "chunks": ${CHUNK_COUNT},
  "uploadedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "bucket": "${BUCKET_NAME}",
  "prefix": "mahabharata/"
}
EOF
echo -e "${GREEN}✓ Metadata created${NC}"
echo ""

# Start Bedrock KB sync (if KB ID is provided)
if [ -n "$KB_ID" ]; then
    echo "Step 6: Starting Bedrock KB sync..."
    
    # Create or update data source
    DATA_SOURCE_ID=$(aws bedrock-agent list-data-sources \
        --knowledge-base-id "$KB_ID" \
        --query 'dataSourceSummaries[0].dataSourceId' \
        --output text 2>/dev/null || echo "")
    
    if [ -z "$DATA_SOURCE_ID" ] || [ "$DATA_SOURCE_ID" == "None" ]; then
        echo -e "${YELLOW}Warning: No data source found for KB $KB_ID${NC}"
        echo "Please create a data source manually in the AWS Console:"
        echo "1. Go to Amazon Bedrock Console"
        echo "2. Navigate to Knowledge Bases"
        echo "3. Select KB: $KB_ID"
        echo "4. Add data source from S3: s3://$BUCKET_NAME/mahabharata/"
    else
        echo "Found data source: $DATA_SOURCE_ID"
        
        # Start ingestion job
        INGESTION_JOB=$(aws bedrock-agent start-ingestion-job \
            --knowledge-base-id "$KB_ID" \
            --data-source-id "$DATA_SOURCE_ID" \
            --output json 2>/dev/null || echo "")
        
        if [ -n "$INGESTION_JOB" ]; then
            INGESTION_ID=$(echo "$INGESTION_JOB" | jq -r '.ingestionJob.ingestionJobId')
            echo -e "${GREEN}✓ Started ingestion job: $INGESTION_ID${NC}"
            echo ""
            echo "Monitoring ingestion job..."
            
            # Wait for completion
            while true; do
                STATUS=$(aws bedrock-agent get-ingestion-job \
                    --knowledge-base-id "$KB_ID" \
                    --data-source-id "$DATA_SOURCE_ID" \
                    --ingestion-job-id "$INGESTION_ID" \
                    --query 'ingestionJob.status' \
                    --output text 2>/dev/null || echo "FAILED")
                
                echo "Status: $STATUS"
                
                if [ "$STATUS" == "COMPLETE" ]; then
                    echo -e "${GREEN}✓ Ingestion complete!${NC}"
                    break
                elif [ "$STATUS" == "FAILED" ]; then
                    echo -e "${RED}✗ Ingestion failed${NC}"
                    exit 1
                elif [ "$STATUS" == "STOPPED" ]; then
                    echo -e "${YELLOW}⚠ Ingestion stopped${NC}"
                    break
                fi
                
                sleep 30
            done
        else
            echo -e "${YELLOW}Warning: Could not start ingestion job${NC}"
        fi
    fi
else
    echo -e "${YELLOW}Step 6: Skipped - No BEDROCK_KB_ID provided${NC}"
    echo "To sync KB manually:"
    echo "  1. AWS Console → Bedrock → Knowledge Bases"
    echo "  2. Create/update data source from s3://$BUCKET_NAME/mahabharata/"
fi

echo ""
echo "========================================"
echo -e "${GREEN}Knowledge Base Population Complete!${NC}"
echo "========================================"
echo ""
echo "Summary:"
echo "  - Bucket: s3://$BUCKET_NAME"
echo "  - Chunks uploaded: $CHUNKS_UPLOADED"
echo "  - Total size: $FILE_SIZE"
if [ -n "$KB_ID" ]; then
    echo "  - Knowledge Base: $KB_ID"
fi
echo ""
echo "Next steps:"
echo "  1. Create Bedrock Knowledge Base (if not exists)"
echo "  2. Add S3 data source: s3://$BUCKET_NAME/mahabharata/"
echo "  3. Start sync from AWS Console"
echo "  4. Update BEDROCK_KB_ID environment variable"
echo ""
