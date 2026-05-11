#!/bin/bash
# Database initialization script for Docker Compose
# This script runs when PostgreSQL container starts for the first time

set -e

echo "=== OrderFlow Database Initialization ==="

# Create additional databases if needed
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create test database
    CREATE DATABASE orderflow_test;
    
    -- Grant privileges
    GRANT ALL PRIVILEGES ON DATABASE orderflow_test TO $POSTGRES_USER;
    
    -- Add any initial schema extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    
    \echo 'Databases initialized successfully'
EOSQL

echo "=== Database initialization complete ==="
