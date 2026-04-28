# Stage 1: Build the React frontend
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy all files
COPY . .

# Build the frontend
# Note: VITE_ variables must be present at build time if they are used in the client
RUN npm run build

# Stage 2: Serve the app with Express
FROM node:20-slim

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy the built frontend and the server code
COPY --from=builder /app/dist ./dist
COPY server.js ./

# Set environment to production
ENV NODE_ENV=production

# Expose the port the app runs on
EXPOSE 3005

# Start the server
CMD ["node", "server.js"]
