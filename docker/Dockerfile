# Apogee LibreChat Production Dockerfile
# Based on LibreChat's official Dockerfile with Apogee customizations

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache g++ make python3

# Copy package files
COPY package*.json ./
COPY packages/data-provider/package*.json ./packages/data-provider/
COPY packages/mcp/package*.json ./packages/mcp/
COPY client/package*.json ./client/
COPY api/package*.json ./api/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run frontend
RUN npm run backend

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S librechat && \
    adduser -u 1001 -S librechat -G librechat

# Copy built application
COPY --from=builder /app/api/dist ./api/dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy Apogee config
COPY config/apogee/librechat.yaml ./librechat.yaml

# Set ownership
RUN chown -R librechat:librechat /app

# Switch to non-root user
USER librechat

# Environment defaults
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3080

EXPOSE 3080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3080/api/health || exit 1

# Start the application
CMD ["node", "api/dist/server/index.js"]
