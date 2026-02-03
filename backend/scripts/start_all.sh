#!/bin/sh
set -e

if [ -z "$SESSION_SECRET" ]; then
  echo "SESSION_SECRET is required"
  exit 1
fi

if [ -z "$ENCRYPTION_KEY" ]; then
  echo "ENCRYPTION_KEY is required"
  exit 1
fi

if [ -z "$WA_GATEWAY_PASSWORD" ]; then
  echo "WA_GATEWAY_PASSWORD is required"
  exit 1
fi

if [ -z "$AUTH_JWT_SECRET" ]; then
  echo "AUTH_JWT_SECRET is required"
  exit 1
fi

if [ -z "$WHATSAPP_DATASTORE_TYPE" ]; then
  echo "WHATSAPP_DATASTORE_TYPE is required"
  exit 1
fi

if [ -z "$WHATSAPP_DATASTORE_URI" ]; then
  echo "WHATSAPP_DATASTORE_URI is required"
  exit 1
fi

if [ -z "$AUTH_BASIC_PASSWORD" ]; then
  export AUTH_BASIC_PASSWORD="$WA_GATEWAY_PASSWORD"
fi

if [ -z "$AUTH_BASIC_USERNAME" ]; then
  export AUTH_BASIC_USERNAME="gateway"
fi

if [ -z "$WA_GATEWAY_URL" ]; then
  export WA_GATEWAY_URL="http://127.0.0.1:3001/api/v1/whatsapp"
fi

if [ -z "$SERVER_ADDRESS" ]; then
  export SERVER_ADDRESS="127.0.0.1"
fi

if [ -z "$SERVER_PORT" ]; then
  export SERVER_PORT="3001"
fi

if [ -z "$HTTP_BASE_URL" ]; then
  export HTTP_BASE_URL="/api/v1/whatsapp"
fi

echo "Starting Go WA Gateway..."
cd /app/wa-gateway
./gowam-rest &
gateway_pid=$!

echo "Starting Node Backend..."
cd /app
npm start &
node_pid=$!

cleanup() {
  kill "$gateway_pid" "$node_pid" 2>/dev/null || true
  wait "$gateway_pid" 2>/dev/null || true
  wait "$node_pid" 2>/dev/null || true
}

trap cleanup INT TERM

wait "$node_pid"
node_status=$?
cleanup
exit "$node_status"
