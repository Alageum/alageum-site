# syntax=docker/dockerfile:1.7
# Development/test migration image. APP_ENV=production remains fail-closed.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY scripts/strapi-webpack-patch.js ./scripts/strapi-webpack-patch.js
COPY patches/strapi-webpack-koa.json ./patches/strapi-webpack-koa.json
RUN npm ci
COPY . .
# data/catalog-media is the generated immutable raster mirror, outside public/.
# Fail before compiling if the backend-only context omitted or changed any bytes.
RUN node scripts/check-media-package.js
ENV STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
# The caller supplies build configuration as a BuildKit secret, never ARG/ENV
# credentials or a committed .env. A build does not need database connectivity.
RUN --mount=type=secret,id=strapi_build_env,required=true \
    set -a; . /run/secrets/strapi_build_env; set +a; \
    NODE_ENV=production npm run build
RUN npm prune --omit=dev && mkdir -p public/uploads

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8000 \
    STRAPI_TELEMETRY_DISABLED=true STRAPI_HIDE_UPDATE_MESSAGE=true
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
    CMD node -e "fetch('http://127.0.0.1:8000/api/v1/readiness').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "run", "start"]
