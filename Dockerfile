# Stage 1: Build
FROM node:20-bookworm AS builder
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ .
RUN npm run build

# Stage 2: Runtime
FROM node:20-bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy Nuxt build output
COPY --from=builder /app/.output .output

# Copy DuckDB native bindings (not bundled by Nitro)
COPY --from=builder /app/node_modules/@duckdb node_modules/@duckdb
COPY --from=builder /app/node_modules/.duckdb node_modules/.duckdb

EXPOSE 3000

ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", ".output/server/index.mjs"]
