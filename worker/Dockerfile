# Worker BullMQ — Multi-stage con distroless
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY . .

FROM node:20-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]

FROM gcr.io/distroless/nodejs20-debian12 AS production
WORKDIR /app
COPY --from=builder --chown=nonroot:nonroot /app /app
USER nonroot
CMD ["index.js"]
