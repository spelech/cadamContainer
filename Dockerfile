# Stage 1: Build the app
FROM node:22-alpine AS builder
ARG VITE_SUPABASE_URL="https://placeholder-supabase-url.co"
ARG VITE_SUPABASE_ANON_KEY="placeholder-anon-key"
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Build the production server and client assets
RUN npm run build

# Stage 2: Production runtime
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/entrypoint.sh ./entrypoint.sh
RUN npm ci --omit=dev --ignore-scripts
EXPOSE 3000
ENV PORT=3000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
