# m3u4me runs server.ts directly with plain node, which relies on Node's built-in
# TypeScript type stripping — that needs Node 22.18 or newer. node:22-alpine
# always points at the newest 22.x release, so it qualifies.
FROM node:22-alpine

WORKDIR /app

# Copied first so this layer stays cached unless the dependencies change.
COPY package.json package-lock.json ./

# Note: not "npm ci --omit=dev". server.ts imports vite at the top of the file
# for its dev-mode middleware, and that import runs whatever NODE_ENV is set to,
# so vite has to be present in production too.
RUN npm ci --no-audit --no-fund

# Then the rest of the source, and build the frontend into dist/
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# /api/auth/status is public and cheap, so it works as a health probe with no
# extra route and no credentials. Targets 127.0.0.1 rather than "localhost":
# Alpine's musl libc resolves "localhost" to the IPv6 loopback first, but
# server.ts only binds 0.0.0.0 (IPv4), so "localhost" here gets refused every
# time and the container never reports healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/auth/status" || exit 1

CMD ["node", "server.ts"]
