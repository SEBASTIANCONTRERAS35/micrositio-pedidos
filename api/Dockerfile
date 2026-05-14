# ═══════════════════════════════════════════════════════════════════
# API — Multi-stage build con distroless final
# Imagen final ~120 MB sin shell, sin package manager, sin attack surface
# ═══════════════════════════════════════════════════════════════════

# ── Stage 1: builder ──────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copiar package files primero para cache de capas
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copiar el resto del código
COPY . .

# ── Stage 2: dev (para docker-compose) ────────────────────────────
FROM node:20-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── Stage 3: production (distroless, NO shell, NO root) ───────────
FROM gcr.io/distroless/nodejs20-debian12 AS production
WORKDIR /app
COPY --from=builder --chown=nonroot:nonroot /app /app
USER nonroot
EXPOSE 3000
CMD ["api.js"]
