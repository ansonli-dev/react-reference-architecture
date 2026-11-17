FROM node:24.15.0-bookworm-slim@sha256:4e6b70dd6cbfc88c8157ba19aa3d9f9cce6ba4703576d55459e45efcbc9c5f5d AS base
RUN npm install --global --no-audit --no-fund pnpm@11.25.0
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/api-codegen/package.json ./scripts/api-codegen/package.json
RUN test "$(node -p "require('./package.json').packageManager")" = "pnpm@$(pnpm --version)" \
    && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000
# The build already verified the frozen dependency tree; startup is offline.
ENV pnpm_config_verify_deps_before_run=false
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/scripts/build-profiles.mjs /app/scripts/run-app.mjs ./scripts/
COPY --from=build --chown=node:node /app/src/i18n ./src/i18n
COPY --from=build --chown=node:node /app/messages ./messages
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next ./.next
USER node
EXPOSE 3000
CMD ["pnpm", "start"]
