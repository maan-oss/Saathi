FROM node:22-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY flows ./flows
COPY web ./web
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "src/server.js"]
