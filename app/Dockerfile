FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN pnpm build && mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "dist/main.js"]
