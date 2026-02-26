# syntax = docker/dockerfile:1

ARG NODE_VERSION=22.22.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

WORKDIR /app
ENV NODE_ENV="production"

FROM base AS build

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

COPY package-lock.json package.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM base

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package*.json /app/
COPY --from=build /app/dist /app/dist

EXPOSE 3000

CMD [ "npm", "run", "start" ]
