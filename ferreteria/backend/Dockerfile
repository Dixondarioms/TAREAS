# --- Compilación ---
FROM node:22-alpine AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# --- Ejecución ---
FROM node:22-alpine
# Node incluye los datos de zonas horarias (ICU); no hace falta tzdata.
ENV NODE_ENV=production TZ=America/Caracas
WORKDIR /app
COPY --from=compilacion /app/node_modules ./node_modules
COPY --from=compilacion /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:3000/api/salud || exit 1
CMD ["node", "dist/main.js"]
