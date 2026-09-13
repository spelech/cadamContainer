#!/bin/sh
set -e

echo "Running entrypoint script..."

node /app/runtime-inject.mjs

exec "$@"
