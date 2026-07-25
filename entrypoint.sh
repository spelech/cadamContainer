#!/bin/sh
set -e

echo "Running entrypoint script..."

# Replace build-time placeholders with runtime environment variables if they are set
if [ -n "$VITE_SUPABASE_URL" ] && [ "$VITE_SUPABASE_URL" != "https://placeholder-supabase-url.co" ]; then
  echo "Injecting runtime VITE_SUPABASE_URL..."
  find /app/.output -type f -exec sed -i "s|https://placeholder-supabase-url.co|$VITE_SUPABASE_URL|g" {} +
fi

if [ -n "$VITE_SUPABASE_ANON_KEY" ] && [ "$VITE_SUPABASE_ANON_KEY" != "placeholder-anon-key" ]; then
  echo "Injecting runtime VITE_SUPABASE_ANON_KEY..."
  find /app/.output -type f -exec sed -i "s|placeholder-anon-key|$VITE_SUPABASE_ANON_KEY|g" {} +
fi

# Execute the main application server process
exec "$@"
