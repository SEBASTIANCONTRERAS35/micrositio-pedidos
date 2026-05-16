# ═══════════════════════════════════════════════════════════════════
# API — Multi-stage build con distroless final
# Imagen final ~120 MB sin shell, sin package manager, sin attack surface
# NOTA: el build CONTEXT es la raíz del repo (npm workspaces)
# ═══════════════════════════════════════════════════════════════════

# ── Stage 1: builder ──────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /repo

# Copiar manifests de workspaces (cache de capas)
COPY package.json package-lock.json ./
COPY api/package.json ./api/
COPY worker/package.json ./worker/

# Instalar SOLO deps del workspace api (sin dev)
RUN npm ci --omit=dev -w api --include-workspace-root

# Copiar el código de api
COPY api ./api

# ── Stage 2: dev (para docker-compose) ────────────────────────────
FROM node:20-alpine AS dev
WORKDIR /repo
COPY package.json package-lock.json ./
COPY api/package.json ./api/
COPY worker/package.json ./worker/
RUN npm install -w api
COPY api ./api
WORKDIR /repo/api
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── Stage 3: production (distroless, NO shell, NO root) ───────────
FROM gcr.io/distroless/nodejs20-debian12 AS production
WORKDIR /app
COPY --from=builder --chown=nonroot:nonroot /repo/node_modules /app/node_modules
COPY --from=builder --chown=nonroot:nonroot /repo/api /app
USER nonroot
EXPOSE 3000
CMD ["api.js"]
