# Digital Thread frontend — nginx static serving.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
ENV NGINX_ENVSUBST_FILTER=API_UPSTREAM
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://localhost/ || exit 1
