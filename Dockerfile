FROM node:20-slim

# Create app directory
WORKDIR /app

# Create a non-root user with the same UID as your host user
RUN groupadd -g 1000 nodeuser && \
    useradd -u 1000 -g nodeuser -s /bin/bash -m nodeuser

# Copy package files
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Set correct ownership
RUN chown -R nodeuser:nodeuser /app

# Switch to non-root user
USER nodeuser

EXPOSE 3000

CMD ["npm", "start"] 