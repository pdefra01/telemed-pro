# Stage 1: Build the React frontend
FROM node:20-slim AS builder

WORKDIR /app

# Build arguments for Vite variables
# These must be provided during build time in Coolify (Build Pack)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_LIVEKIT_URL

# Set environment variables for the build process
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy all files
COPY . .

# Remove local environment files to prevent them from overriding Coolify's build variables in Vite
RUN rm -f .env .env.local

# Build the frontend
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
COPY server ./server

# Set environment to production
ENV NODE_ENV=production

# Expose the port the app runs on (Coolify default is often 3000)
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
