FROM node:22-alpine
WORKDIR /app
COPY agentic-prototype/package*.json ./
RUN npm ci --omit=dev
COPY agentic-prototype/ ./
COPY mock-server ./mock-server
ENV NODE_ENV=production
EXPOSE 8000 8001
CMD ["node", "server.js"]
