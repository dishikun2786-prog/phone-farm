# VPS Relay Server — 仅运行 BridgeServer + UDP Relay
FROM node:22-alpine

WORKDIR /app

# Copy package files and install ALL deps (need tsx for TypeScript runtime)
COPY package.json package-lock.json ./
RUN npm ci

# Copy TypeScript source and config
COPY tsconfig.json ./
COPY src/ ./src/

# Expose ports
EXPOSE 8499
EXPOSE 8444/udp

# Start relay server
CMD ["npx", "tsx", "src/vps-relay.ts"]
