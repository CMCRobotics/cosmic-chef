ARG BUN_IMAGE=oven/bun:slim

# Stage 1: Build the frontend
FROM ${BUN_IMAGE} AS build

WORKDIR /build

# Copy application source and assets
COPY . .

RUN bun install

RUN bun run build

# Stage 2: Runtime environment
FROM ${BUN_IMAGE}

WORKDIR /app

# Copy built assets and runtime files from Stage 1
COPY --from=build /build/dist .

EXPOSE 3000

ENTRYPOINT ["./cosmic-chef"]


