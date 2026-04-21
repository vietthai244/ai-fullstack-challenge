# frontend/Dockerfile — multi-stage build
# Stage 1: build the React SPA
FROM node:20-alpine AS builder

WORKDIR /app

# Install corepack so Yarn 4 is available
RUN corepack enable

# Copy workspace manifests and lock file first (layer cache)
COPY package.json yarn.lock .yarnrc.yml ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install all deps
RUN yarn install --immutable

# Build shared first (frontend imports from @campaign/shared dist/)
COPY shared/ ./shared/
RUN yarn workspace @campaign/shared build

# Copy frontend source and build
COPY frontend/ ./frontend/
RUN yarn workspace @campaign/frontend build

# Stage 2: nginx production image
FROM nginx:alpine

# Replace default nginx config with our SPA + proxy config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled SPA from builder stage
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
