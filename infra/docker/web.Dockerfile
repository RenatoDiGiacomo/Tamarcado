# Multi-stage: target `development` (Vite dev server) e `production` (preview do build).
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# --- Desenvolvimento: Vite dev server com HMR ---
FROM base AS development
COPY . .
RUN pnpm install --frozen-lockfile
# shared-types precisa do dist/ para ser resolvido pelo web.
RUN pnpm --filter @tamarcado/shared-types build
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["pnpm", "run", "dev", "--", "--host", "--port", "5173"]

# --- Build estático de produção ---
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @tamarcado/shared-types build
RUN pnpm --filter web build

# --- Produção / staging local: serve o dist via vite preview ---
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/web
EXPOSE 4173
CMD ["pnpm", "run", "preview", "--", "--host", "--port", "4173"]
