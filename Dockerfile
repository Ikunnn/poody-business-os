FROM node:22-alpine
WORKDIR /app
COPY agentic-prototype/package*.json ./
RUN npm ci --omit=dev
COPY agentic-prototype/ ./
ENV NODE_ENV=production
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://localhost:${PORT:-8001}/health || exit 1
CMD ["node", "server.js"]
