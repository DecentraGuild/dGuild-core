# Bypasses Railpack: it scans bundled JS for process.env.* and requires BuildKit secrets
# that Railway does not always inject. Standard Docker build = runtime env only.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
