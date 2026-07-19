# Stage 1: Build the TypeScript backend
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install --legacy-peer-deps
COPY src ./src
RUN npm run build

# Stage 2: Production runtime
FROM node:20-slim
WORKDIR /app

# Install Puppeteer system dependencies and Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the pre-installed system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

# Install production dependencies only
COPY package*.json ./
RUN npm install --legacy-peer-deps --only=production

# Copy built code and required assets
COPY --from=builder /app/dist ./dist
COPY public ./public
COPY scripts ./scripts
# Copy json data files in case they are used at runtime
COPY *.json ./

EXPOSE 5000

CMD ["node", "dist/index.js"]
