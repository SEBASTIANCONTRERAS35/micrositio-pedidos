# Worker BullMQ — Multi-stage con distroless
# NOTA: build CONTEXT es la raíz del repo (npm workspaces)

FROM node:20-alpine AS builder
WORKDIR /repo
COPY package.json package-lock.json ./
COPY api/package.json ./api/
COPY worker/package.json ./worker/
RUN npm ci --omit=dev --ignore-scripts -w worker --include-workspace-root
COPY worker ./worker

FROM node:20-alpine AS dev
WORKDIR /repo
COPY package.json package-lock.json ./
COPY api/package.json ./api/
COPY worker/package.json ./worker/
RUN npm install --ignore-scripts -w worker
COPY worker ./worker
WORKDIR /repo/worker
CMD ["npm", "run", "dev"]

FROM gcr.io/distroless/nodejs20-debian12 AS production
WORKDIR /app
COPY --from=builder --chown=nonroot:nonroot /repo/node_modules /app/node_modules
COPY --from=builder --chown=nonroot:nonroot /repo/worker /app
USER nonroot
CMD ["index.js"]
