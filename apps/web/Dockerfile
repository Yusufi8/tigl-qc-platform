FROM node:22-alpine AS build
WORKDIR /app
ENV API_INTERNAL_URL=http://api:3001
ENV API_INTERNAL_URL=http://api:3001
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci && npm run build --workspace @tigl-qc/web
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node","apps/web/server.js"]
