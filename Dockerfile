FROM node:22-slim

WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Copy project source code and database state
COPY . .

# Build optimized and code-split Vite frontend into /app/dist
RUN npm run build

# Ensure /app/data and /app/data/uploads are writable by both root and non-root containers (e.g., Hugging Face Spaces UID 1000)
RUN mkdir -p /app/data/uploads /app/data/backups && chmod -R 777 /app/data

ENV NODE_ENV=production
# Default to 7860 for Hugging Face Spaces; Render & Koyeb automatically inject their own PORT env var
ENV PORT=7860

EXPOSE 7860
EXPOSE 3000

CMD ["npm", "start"]
