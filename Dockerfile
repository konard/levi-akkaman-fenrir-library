FROM node:20-alpine

WORKDIR /app

# Install production dependencies first to leverage Docker layer caching.
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the application source.
COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
