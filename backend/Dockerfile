FROM node:22-bookworm-slim AS domain
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY backend/domain/bridge.ts ./backend/domain/bridge.ts
COPY scripts/build-domain.mjs ./scripts/build-domain.mjs
RUN node scripts/build-domain.mjs

FROM python:3.12-slim-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY --from=domain /usr/local/bin/node /usr/local/bin/node
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home strand && mkdir /data && chown strand:strand /data
COPY backend/strand_api ./strand_api
COPY backend/migrations ./migrations
COPY --from=domain /build/backend/domain/bridge.mjs ./domain/bridge.mjs
USER strand
ENV STRAND_DATABASE_PATH=/data/strand.sqlite3
EXPOSE 8000
CMD ["uvicorn", "strand_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
