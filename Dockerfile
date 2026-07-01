# Cloud Run Node server for Vector Accuracy Studio.
# Serves the static browser app (app/) AND a POST /trace endpoint that runs the platform-
# deterministic engine headless (server/) via a worker pool. Listens on $PORT (default 8080).
# (Previous nginx static-only host kept as Dockerfile.nginx.bak.)
FROM node:22-slim

WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PORT=8080

# Install production deps (native prebuilds: @napi-rs/canvas, @resvg/resvg-js; linkedom is pure JS).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App (static browser app) + server (Node engine host + workers).
COPY app/ ./app/
COPY server/ ./server/

EXPOSE 8080
CMD ["node", "server/server.js"]
