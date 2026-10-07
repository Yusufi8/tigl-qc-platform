FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
COPY database ./database
COPY TIGL-QC-Dev-Packet/seed ./TIGL-QC-Dev-Packet/seed
COPY TIGL-QC-Dev-Packet/db/schema.sql ./TIGL-QC-Dev-Packet/db/schema.sql
RUN apk add --no-cache postgresql16-client && npm ci --omit=dev
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
CMD ["node","--experimental-strip-types","apps/api/src/server.mjs"]
