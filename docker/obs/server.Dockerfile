FROM node:20-alpine AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/obs-server ./packages/obs-server
RUN corepack enable && corepack prepare pnpm@10.5.0 --activate
RUN pnpm -w --filter @hautech/obs-server install --frozen-lockfile
RUN pnpm -w --filter @hautech/obs-server build
CMD ["node", "packages/obs-server/dist/index.mjs"]
