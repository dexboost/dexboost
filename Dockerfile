# Use Node.js LTS version
FROM node:20-alpine

# Install Python and build dependencies
RUN apk add --no-cache python3 make g++ gcc

# Create app directory
WORKDIR /app

# First, copy and install backend dependencies
COPY package*.json ./
RUN npm install

# Then, copy and install frontend dependencies
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm install

# Copy all project files
WORKDIR /app
COPY . .

# Build frontend
WORKDIR /app/frontend
RUN npm run build

# Back to main directory
WORKDIR /app

# Expose the port your app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"] 