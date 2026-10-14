# One image for every deployment (RF-1300, ADR-014, DEC-61). Build it from the repository root:
#   docker build -t rosetta .                    the runtime image (the last stage, the default target)
#   docker build --target test -t rosetta-test . the test image with the fakes (compose.ci.yaml only)
# The base is Node.js 24 slim pinned by digest; Dependabot proposes a newer digest (DEC-42).
# No secret is built into any stage: configuration comes from the environment at run time.

# The install stages use the npm of the base image; the lock file is written so that every npm 11 accepts it
# (P1-87), so no npm version is pinned here.

# Stage 1: install every dependency, compile the server and build the front end.
FROM node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY web ./web
# The build output keeps no source maps and no incremental build file.
RUN npm run build \
  && find dist -name '*.map' -delete \
  && rm -f dist/.tsbuildinfo

# Stage 2: production dependencies only, without the maps and test files the packages ship. Install
# scripts stay off; the tree-sitter C# grammar ships its WebAssembly file and needs no compiler.
FROM node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && find node_modules -name '*.map' -delete \
  && find node_modules -type d \( -name test -o -name tests -o -name __tests__ \) -prune -exec rm -rf {} + \
  && find node_modules -type f \( -name '*.test.*' -o -name '*.spec.*' \) -delete

# Stage 3: the test image used only by compose.ci.yaml (RNF-005, DEC-112). It adds the test support
# code (the fake provider and the fake GitHub) to the full build, and sets ROSETTA_TEST=1, which the
# server refuses on an https public URL. The command that starts the doubles belongs to compose.ci.yaml.
FROM node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS test
ENV NODE_ENV=production ROSETTA_TEST=1 ROSETTA_DATA_DIR=/data
WORKDIR /app
COPY --from=build /app ./
COPY db/migrations ./db/migrations
COPY prompts ./prompts
COPY prices ./prices
COPY templates ./templates
COPY scripts ./scripts
COPY tests ./tests
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "dist/presentation/main.js"]

# Stage 4: the runtime image. Production dependencies, the built server and front end, the migrations,
# prompts, price table, templates and the common-password list; no source, tests, maps, fakes or build
# tools. Operating-system packages are upgraded to the fixed versions the pinned base may lack (the
# Trivy gate of CI fails on a fixable high finding), and the Node.js package manager is removed:
# nothing in the running server needs it.
FROM node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS runtime
ENV NODE_ENV=production ROSETTA_DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY db/migrations ./db/migrations
COPY prompts ./prompts
COPY prices ./prices
COPY templates ./templates
COPY src/infrastructure/security/common-passwords.txt ./src/infrastructure/security/common-passwords.txt
RUN apt-get update \
  && apt-get upgrade --yes --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
  /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && mkdir /data && chown node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/healthz', { signal: AbortSignal.timeout(4000) }).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/presentation/main.js"]
