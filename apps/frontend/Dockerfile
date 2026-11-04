# Built from the repository root, because the frontend uses packages/contracts.
FROM node:24-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@10.34.9
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter frontend build

FROM nginx:1.29-alpine
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html
