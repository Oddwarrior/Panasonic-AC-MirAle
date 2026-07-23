# Build stage
FROM node:20-alpine AS build

WORKDIR /app
# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci
# Copy source code and build the Vite app
COPY . .
RUN npm run build



# Production stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]