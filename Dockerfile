# Stage 1: Build the frontend
FROM oven/bun:slim AS build

WORKDIR /build

# Copy application source and assets
COPY . .

RUN bun install

RUN bun run build

# Stage 2: Runtime environment
FROM oven/bun:slim

WORKDIR /app

# Copy built assets and runtime files from Stage 1
COPY --from=build /build/dist .

EXPOSE 3000

ENTRYPOINT ["./cosmic-chef"]


