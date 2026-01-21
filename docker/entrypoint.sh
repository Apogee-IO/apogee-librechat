#!/bin/sh
# Apogee LibreChat Entrypoint
# Constructs MONGO_URI from separate environment variables at runtime
# Also substitutes MCP_GATEWAY_URL in librechat.yaml

set -e

# Substitute MCP_GATEWAY_URL in librechat.yaml if the env var is set
if [ -n "$MCP_GATEWAY_URL" ] && [ -f /app/librechat.yaml ]; then
  echo "Substituting MCP_GATEWAY_URL in librechat.yaml: $MCP_GATEWAY_URL"
  # Replace the env var syntax with actual URL
  sed -i "s|\${MCP_GATEWAY_URL:-[^}]*}|$MCP_GATEWAY_URL|g" /app/librechat.yaml
fi

# If MONGODB_USER and MONGODB_PASSWORD are set, construct the full URI
if [ -n "$MONGODB_USER" ] && [ -n "$MONGODB_PASSWORD" ] && [ -n "$MONGODB_HOST" ]; then
  # URL-encode the password (basic encoding for common special chars)
  ENCODED_PASSWORD=$(echo -n "$MONGODB_PASSWORD" | sed 's/@/%40/g; s/:/%3A/g; s/\//%2F/g; s/?/%3F/g; s/#/%23/g')

  # Build the full MongoDB URI
  export MONGO_URI="mongodb://${MONGODB_USER}:${ENCODED_PASSWORD}@${MONGODB_HOST}:27017/librechat?tls=true&tlsCAFile=/app/rds-combined-ca-bundle.pem&retryWrites=false&directConnection=true&authSource=admin"

  echo "MongoDB URI constructed from environment variables"
fi

# Execute the original command (npm start)
exec "$@"
