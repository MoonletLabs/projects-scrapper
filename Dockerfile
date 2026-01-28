FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN mkdir -p /app/output /app/screenshots
CMD ["tail", "-f", "/dev/null"]
