FROM node:24-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build && mkdir -p storage && chown node:node storage

USER node
EXPOSE 3000
CMD ["npm", "start"]
