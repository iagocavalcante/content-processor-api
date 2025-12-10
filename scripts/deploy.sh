#!/bin/bash

# Deployment script for Content Processor API on Fly.io
# Usage: ./scripts/deploy.sh [environment]
# Environments: dev, staging, production

set -e

ENVIRONMENT=${1:-dev}
APP_NAME="content-processor-api"

echo "========================================="
echo "  Content Processor API Deployment"
echo "  Environment: $ENVIRONMENT"
echo "========================================="

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if flyctl is installed
if ! command -v fly &> /dev/null; then
    echo -e "${RED}Error: fly CLI not found. Install from https://fly.io/docs/hands-on/install-flyctl/${NC}"
    exit 1
fi

# Check if logged in
if ! fly auth whoami &> /dev/null; then
    echo -e "${RED}Error: Not logged in to Fly.io. Run 'fly auth login'${NC}"
    exit 1
fi

# Set app name based on environment
if [ "$ENVIRONMENT" != "production" ]; then
    APP_NAME="$APP_NAME-$ENVIRONMENT"
fi

echo -e "${GREEN}Using app: $APP_NAME${NC}"

# Check if app exists
if ! fly apps list | grep -q "$APP_NAME"; then
    echo -e "${YELLOW}App does not exist. Creating...${NC}"

    read -p "Region (default: iad): " REGION
    REGION=${REGION:-iad}

    fly launch --name "$APP_NAME" --region "$REGION" --no-deploy

    # Create database
    echo -e "${YELLOW}Creating PostgreSQL database...${NC}"
    DB_NAME="$APP_NAME-db"
    fly postgres create --name "$DB_NAME" --region "$REGION" --vm-size shared-cpu-2x --volume-size 10

    # Attach database
    echo -e "${YELLOW}Attaching database...${NC}"
    fly postgres attach "$DB_NAME" --app "$APP_NAME"

    # Set required secrets
    echo -e "${YELLOW}Setting required secrets...${NC}"
    JWT_SECRET=$(openssl rand -base64 32)
    fly secrets set JWT_SECRET="$JWT_SECRET" --app "$APP_NAME"

    echo -e "${GREEN}Initial setup complete!${NC}"
fi

# Pre-deployment checks
echo -e "${YELLOW}Running pre-deployment checks...${NC}"

# Check secrets
echo "Checking required secrets..."
if ! fly secrets list --app "$APP_NAME" | grep -q "JWT_SECRET"; then
    echo -e "${RED}Error: JWT_SECRET not set${NC}"
    exit 1
fi

if ! fly secrets list --app "$APP_NAME" | grep -q "DATABASE_URL"; then
    echo -e "${RED}Error: DATABASE_URL not set${NC}"
    exit 1
fi

# Build locally (optional, for faster feedback)
if [ "$ENVIRONMENT" == "dev" ]; then
    echo -e "${YELLOW}Running local build test...${NC}"
    npm run build || {
        echo -e "${RED}Build failed. Fix errors before deploying.${NC}"
        exit 1
    }
fi

# Deploy
echo -e "${YELLOW}Deploying to Fly.io...${NC}"

if [ "$ENVIRONMENT" == "production" ]; then
    # Production: Rolling deployment
    fly deploy --app "$APP_NAME" --strategy rolling
elif [ "$ENVIRONMENT" == "staging" ]; then
    # Staging: Canary deployment
    fly deploy --app "$APP_NAME" --strategy canary
else
    # Dev: Immediate deployment
    fly deploy --app "$APP_NAME" --strategy immediate
fi

# Post-deployment verification
echo -e "${YELLOW}Verifying deployment...${NC}"

sleep 5

# Check health
HEALTH_URL=$(fly info --app "$APP_NAME" | grep Hostname | awk '{print "https://" $2 "/health"}')
echo "Checking health endpoint: $HEALTH_URL"

if curl -sf "$HEALTH_URL" > /dev/null; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${RED}✗ Health check failed${NC}"
    echo "Recent logs:"
    fly logs --app "$APP_NAME" --lines 50
    exit 1
fi

# Display app info
echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Deployment Successful!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "App URL: https://$(fly info --app "$APP_NAME" | grep Hostname | awk '{print $2}')"
echo "Documentation: https://$(fly info --app "$APP_NAME" | grep Hostname | awk '{print $2}')/documentation"
echo ""
echo "Useful commands:"
echo "  View logs:     fly logs --app $APP_NAME"
echo "  SSH console:   fly ssh console --app $APP_NAME"
echo "  Status:        fly status --app $APP_NAME"
echo "  Scale:         fly scale count 3 --app $APP_NAME"
echo ""
