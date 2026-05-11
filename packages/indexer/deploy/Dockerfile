# Minimal Ponder deployment image for @jinn-network/indexer.
#
# Build:
#   docker build -t jinn-indexer:latest .
#
# Run (production, Postgres backend):
#   docker run --env-file .env -p 42069:42069 jinn-indexer:latest
#
# Run (dev/local, PGlite backend):
#   docker run -e PONDER_RPC_URL_84532=https://sepolia.base.org \
#              -e PONDER_RPC_URL_8453=https://mainnet.base.org \
#              -p 42069:42069 jinn-indexer:latest yarn dev

FROM node:22-slim

# Enable corepack so Yarn version matches packageManager field in package.json.
RUN corepack enable

WORKDIR /app

# Copy package manifests first for layer caching.
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

# Install production dependencies only.
RUN yarn install --immutable

# Copy the rest of the source.
COPY . .

# Build the Ponder app (validates schema, compiles TypeScript).
RUN yarn build

EXPOSE 42069

# Default: run the production server (indexer + HTTP).
# Override with 'yarn serve' to run HTTP-only (no indexer).
CMD ["yarn", "start"]
