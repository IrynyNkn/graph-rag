# Builds any backend service: docker build --build-arg SERVICE=indexing-service .
# The image holds only the packages that service declares.
FROM node:24-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@10.34.9
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
ARG SERVICE
RUN pnpm --filter "${SERVICE}..." --filter "!@graph-rag/testing" build
RUN pnpm --filter "${SERVICE}" deploy --legacy --prod /out

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out .
# A new named volume takes over the owner of this directory, so the services can write to it.
RUN mkdir -p /data/files && chown node:node /data/files
USER node
CMD ["node", "dist/main.js"]
