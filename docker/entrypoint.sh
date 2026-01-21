#!/bin/sh
# Apogee LibreChat Entrypoint
# Constructs MONGO_URI from separate environment variables at runtime

set -e

# If MONGODB_USER and MONGODB_PASSWORD are set, construct the full URI
if [ -n "$MONGODB_USER" ] && [ -n "$MONGODB_PASSWORD" ] && [ -n "$MONGODB_HOST" ]; then
  # URL-encode the password (basic encoding for common special chars)
  ENCODED_PASSWORD=$(echo -n "$MONGODB_PASSWORD" | sed 's/@/%40/g; s/:/%3A/g; s/\//%2F/g; s/?/%3F/g; s/#/%23/g')

  # Build the full MongoDB URI
  export MONGO_URI="mongodb://${MONGODB_USER}:${ENCODED_PASSWORD}@${MONGODB_HOST}:27017/librechat?tls=true&tlsCAFile=/app/rds-combined-ca-bundle.pem&retryWrites=false&directConnection=true"

  echo "MongoDB URI constructed from environment variables"
fi

# Execute the original command (npm start)
exec "$@"
