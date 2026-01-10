# --- Stage 1: Build Go WhatsApp Gateway ---
FROM golang:1.25-alpine AS gateway-builder

WORKDIR /src/wa-gateway
COPY wa-gateway/go.mod wa-gateway/go.sum ./
RUN go mod download
COPY wa-gateway/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -a -o gowam-rest cmd/main/main.go

# --- Stage 2: Build Node.js Backend ---
FROM node:20-bookworm AS node-builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ git libvips-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --legacy-peer-deps; else npm install --omit=dev --legacy-peer-deps; fi
COPY . ./

# --- Stage 3: Runtime ---
FROM node:20-bookworm-slim AS runner

RUN apt-get update \
    && apt-get install -y --no-install-recommends libvips ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=node-builder /app /app
COPY --from=gateway-builder /src/wa-gateway/gowam-rest /app/wa-gateway/gowam-rest

RUN mkdir -p sessions media wa-gateway/dbs wa-gateway/.bin/webp \
    && chmod +x /app/wa-gateway/gowam-rest \
    && chmod +x /app/scripts/start_all.sh

EXPOSE 3000
ENV NODE_ENV=production
ENV WA_GATEWAY_URL=http://127.0.0.1:3001/api/v1/whatsapp
ENV HTTP_BASE_URL=/api/v1/whatsapp
ENV SERVER_ADDRESS=127.0.0.1
ENV SERVER_PORT=3001
ENV WEBHOOK_URL=http://127.0.0.1:3000/api/v1/webhook/incoming

CMD ["sh", "/app/scripts/start_all.sh"]
