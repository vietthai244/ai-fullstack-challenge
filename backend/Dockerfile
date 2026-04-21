# backend/Dockerfile — multi-stage build
# Stage 1: compile TypeScript to dist/
FROM node:20-alpine AS builder

WORKDIR /app

# Install corepack so Yarn 4 is available
RUN corepack enable

# Copy workspace manifests and lock file for cache, plus full shared source.
# shared/ is included here because the root postinstall runs
# "yarn workspace @campaign/shared build" — tsc needs shared/src/ to exist.
# Backend and frontend manifests only (source copied after install for cache).
COPY package.json yarn.lock .yarnrc.yml tsconfig.base.json ./
COPY shared/ ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install ALL deps (including devDeps for tsc).
# postinstall builds shared automatically.
RUN yarn install --immutable

# Copy backend source and compile
COPY backend/ ./backend/
RUN yarn workspace @campaign/backend build

# Stage 2: production image
FROM node:20-alpine

WORKDIR /app

RUN corepack enable

# Copy workspace manifests and lock file
COPY package.json yarn.lock .yarnrc.yml ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install production deps only (focused install does not trigger root postinstall).
RUN yarn workspaces focus @campaign/backend --production

# Copy compiled output from builder
COPY --from=builder /app/backend/dist ./backend/dist

# Copy shared dist (runtime types/validators used at runtime)
COPY --from=builder /app/shared/dist ./shared/dist

# Copy sequelize-cli runtime files (excluded from tsc, needed for db:migrate)
COPY backend/.sequelizerc ./backend/.sequelizerc
COPY backend/src/migrations ./backend/src/migrations
COPY backend/src/seeders ./backend/src/seeders
COPY backend/src/db/config.cjs ./backend/src/db/config.cjs

WORKDIR /app/backend

EXPOSE 3000

# Run migrations then start the server
CMD ["sh", "-c", "yarn db:migrate && node dist/index.js"]
