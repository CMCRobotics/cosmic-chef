# Stage 1: Build the frontend and install dependencies
FROM registry.cern.ch/docker.io/oven/bun:slim AS build

WORKDIR /app

# Copy package configuration and npmrc auth settings
COPY package.json ./

# Install all dependencies (including packages on the private GitHub package registry)
RUN bun install

# Copy application source and assets
COPY . .

# Build the frontend bundles
RUN bun run build

# Stage 2: Production environment
FROM registry.cern.ch/docker.io/oven/bun:slim

WORKDIR /app

# Copy built assets and runtime files from Stage 1
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/assets ./assets
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules


EXPOSE 3000


ENTRYPOINT ["bun", "run", "start"]


