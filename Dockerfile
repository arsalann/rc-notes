# Stage 1: Build
FROM node:20-bookworm AS builder
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ .
RUN npm run build

# Stage 2: Runtime. Nitro bundles/traces everything it needs (including `pg`) into .output.
FROM node:20-bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.output .output

ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production
# Timestamps are stored as UTC wall time; keep the process clock in UTC too.
ENV TZ=UTC

EXPOSE 3000
USER node

CMD ["node", ".output/server/index.mjs"]
