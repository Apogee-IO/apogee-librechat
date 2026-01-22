#!/bin/sh
# Apogee LibreChat Entrypoint
# Constructs MONGO_URI from separate environment variables at runtime
# Also substitutes MCP_GATEWAY_URL in librechat.yaml
# Applies Apogee SSO auth patch if configured

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

# Apply Apogee SSO auth patch if public key is configured
echo "[Apogee SSO] Checking SSO configuration..."
echo "[Apogee SSO] APOGEE_JWT_PUBLIC_KEY set: $([ -n "$APOGEE_JWT_PUBLIC_KEY" ] && echo 'yes' || echo 'no')"
echo "[Apogee SSO] patch-auth.js exists: $([ -f /app/apogee-server/patch-auth.js ] && echo 'yes' || echo 'no')"
ls -la /app/apogee-server/ 2>/dev/null || echo "[Apogee SSO] /app/apogee-server/ directory not found"

if [ -n "$APOGEE_JWT_PUBLIC_KEY" ] && [ -f /app/apogee-server/patch-auth.js ]; then
  echo "[Apogee SSO] Applying authentication patch..."
  node /app/apogee-server/patch-auth.js || echo "[Apogee SSO] Warning: Auth patch failed, continuing without SSO"
else
  echo "[Apogee SSO] Skipping patch - prerequisites not met"
fi

# Execute the original command (npm start)
exec "$@"
