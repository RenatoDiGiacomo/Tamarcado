# Multi-stage: target `development` (dev compose) e `production` (staging/prod).
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# --- Desenvolvimento: hot-reload via nest start --watch ---
FROM base AS development
COPY . .
RUN pnpm install --frozen-lockfile
# Pacotes compartilhados precisam do dist/ para serem resolvidos pela API.
RUN pnpm --filter @tamarcado/shared-types --filter @tamarcado/shared-utils build
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["pnpm", "run", "start:dev"]

# --- Build de produção ---
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @tamarcado/shared-types --filter @tamarcado/shared-utils --filter api build

# --- Produção / staging: roda o dist compilado ---
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
