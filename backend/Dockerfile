# Backend-only Dockerfile (Node/Express API)
# WA Gateway dijalankan terpisah via backend/wa-gateway/Dockerfile

FROM node:20-bookworm AS deps

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --legacy-peer-deps; else npm install --omit=dev --legacy-peer-deps; fi

FROM node:20-bookworm-slim

# Runtime deps untuk sharp, https, dsb.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libvips ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules dari stage deps
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

ENV NODE_ENV=production
EXPOSE 3300

CMD ["npm", "start"]
