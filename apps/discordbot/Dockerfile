# Bypasses Railpack: it scans bundled JS for process.env.* and requires BuildKit secrets
# that Railway does not always inject. Standard Docker build = runtime env only.
#
# Railway + Dockerfile: service variables are injected when the container *runs*, not into
# RUN layers unless you declare ARG and pass them (see Railway Dockerfiles guide). This
# project does not need SUPABASE_* during `npm run build`; a successful build does not
# prove those variables exist on the Railway service.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
