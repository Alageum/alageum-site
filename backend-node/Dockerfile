# syntax=docker/dockerfile:1.7
# Official multi-architecture Node 24 manifest, locked 2026-10-19.
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5
FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY scripts/strapi-webpack-patch.js ./scripts/strapi-webpack-patch.js
COPY patches/strapi-webpack-koa.json ./patches/strapi-webpack-koa.json
RUN npm ci
COPY . .
RUN node scripts/check-media-package.js
ENV STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
# Build configuration is explicitly synthetic. No database connection or actual
# runtime credential is needed, passed to BuildKit, or baked into the image.
RUN node scripts/build-container.js
# Strapi's migration provider creates this directory before its first DB access.
# Empty directories do not survive Git checkout; create it in the image rather
# than requiring the non-root runtime to write to the root-owned /app directory.
RUN npm prune --omit=dev && mkdir -p public/uploads database/migrations

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV APP_ENV=production NODE_ENV=production HOST=0.0.0.0 PORT=8000 \
    STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
COPY --from=build --chown=node:node /app ./
COPY --from=build /etc/ssl/certs /etc/ssl/certs
USER node
RUN node -e "const fs=require('node:fs');fs.accessSync('database/migrations',fs.constants.R_OK|fs.constants.W_OK|fs.constants.X_OK)"
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=12 \
    CMD node -e "fetch('http://127.0.0.1:8000/api/v1/readiness').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "scripts/start-container.js"]
CMD ["node", "node_modules/@strapi/strapi/bin/strapi.js", "start"]
