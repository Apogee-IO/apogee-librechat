# Apogee LibreChat

Customized LibreChat deployment for Apogee AI platform.

## Overview

This repository contains a configured fork of [LibreChat](https://github.com/danny-avila/LibreChat) that connects to the Apogee MCP gateway for access to legislative tools.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        ALB                                   │
│   mcp.apog.ai (existing)          chat.apog.ai (this)       │
└─────────────────────────────────────────────────────────────┘
              │                              │
              ▼                              ▼
┌─────────────────────────┐    ┌─────────────────────────────┐
│   Apogee MCP Services   │    │   LibreChat                 │
│   ├── gateway           │◄───┤   ├── React frontend        │
│   ├── bill-tracker      │    │   ├── Express backend       │
│   ├── news-monitor      │    │   └── MongoDB (DocumentDB)  │
│   └── crs-summarizer    │    └─────────────────────────────┘
└─────────────────────────┘
```

## Quick Start (Local Development)

### Prerequisites

- Docker and Docker Compose
- AWS credentials with Bedrock access

### Run with apogee-platform

From the `apogee-platform` directory:

```bash
# Start all services including chat
docker compose --profile chat up -d

# Access LibreChat
open http://localhost:3080
```

### Standalone Development

```bash
# Clone this repo
git clone git@github.com:Apogee-IO/apogee-librechat.git
cd apogee-librechat

# Copy environment template
cp config/apogee/.env.template .env
# Edit .env with your values

# Start with Docker Compose
docker compose -f docker/docker-compose.dev.yml up -d
```

## Configuration

### MCP Gateway Connection

The `librechat.yaml` config connects to the Apogee MCP gateway:

```yaml
mcpServers:
  apogee:
    type: streamable-http
    url: ${MCP_GATEWAY_URL:-http://gateway:3001}/mcp
    timeout: 60000
```

### Bedrock Models

Configured to use AWS Bedrock with Claude models:

- Claude 3.5 Sonnet (default)
- Claude 3 Haiku (fast/cheap option)

### Branding

Custom branding assets in `config/apogee/branding/`:
- `logo.svg` - Header logo
- `custom.css` - Style overrides

## Directory Structure

```
apogee-librechat/
├── api/                        # LibreChat backend (upstream)
├── client/                     # LibreChat frontend (upstream)
├── packages/                   # LibreChat shared (upstream)
├── config/
│   └── apogee/
│       ├── librechat.yaml      # MCP and Bedrock config
│       ├── .env.template       # Environment template
│       └── branding/           # Logo and CSS
├── docker/
│   ├── Dockerfile              # Production build
│   └── docker-compose.*.yml    # Compose files
├── deploy/
│   ├── ecs/                    # ECS task definitions
│   └── scripts/                # Deployment scripts
├── .github/
│   └── workflows/              # CI/CD
├── CUSTOMIZATIONS.md           # Track our changes
├── UPSTREAM.md                 # Sync instructions
└── README.md                   # This file
```

## Deployment

### Production (ECS)

Production deployment is handled via CodeBuild:

1. Push to `main` branch
2. CodeBuild builds Docker image
3. Image pushed to ECR
4. ECS service updated

### Manual Deployment

```bash
# Build production image
docker build -t apogee-librechat -f docker/Dockerfile .

# Tag and push to ECR
aws ecr get-login-password --region us-east-1 --profile apogee | \
  docker login --username AWS --password-stdin 654654458581.dkr.ecr.us-east-1.amazonaws.com

docker tag apogee-librechat:latest 654654458581.dkr.ecr.us-east-1.amazonaws.com/apogee-librechat:latest
docker push 654654458581.dkr.ecr.us-east-1.amazonaws.com/apogee-librechat:latest

# Update ECS service
aws ecs update-service --cluster apogee-production --service apogee-librechat --force-new-deployment --profile apogee
```

## Upstream Sync

This repo tracks the upstream LibreChat project. See [UPSTREAM.md](UPSTREAM.md) for sync procedures.

## Documentation

- [LibreChat Docs](https://docs.librechat.ai/)
- [Apogee Implementation Docs](../obsidian/Implementations/Chat-Client/)
- [CUSTOMIZATIONS.md](CUSTOMIZATIONS.md) - Our changes
- [UPSTREAM.md](UPSTREAM.md) - Sync process
