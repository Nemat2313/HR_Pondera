# 1. Base Image with Node 22 (built-in SQLite support)
FROM node:22-alpine AS base

# 2. Dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 3. Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 4. Production Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Install python3 and openpyxl for live database rebuilding from uploaded Excel
RUN apk add --no-cache python3 py3-openpyxl

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public & build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/build_db.py ./build_db.py

# Setup uploads directory with proper permissions
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

# Copy SQLite database (supports both compressed 18MB .gz and raw .db)
COPY --from=builder --chown=nextjs:nodejs /app/pondera_hr.db* ./
RUN if [ ! -f pondera_hr.db ] && [ -f pondera_hr.db.gz ]; then gzip -d -k pondera_hr.db.gz; fi
RUN chown nextjs:nodejs pondera_hr.db*

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"]
