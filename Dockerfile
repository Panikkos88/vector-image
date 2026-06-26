# Cloud Run static host for Vector Accuracy Studio (browser app under app/).
# nginx serves the vendored static app; listens on Cloud Run's $PORT (default 8080).
FROM nginx:1.27-alpine

ENV PORT=8080

# App (HTML/JS/CSS + vendored imagetracer/vtracer). node_modules is NOT needed (vendored).
COPY app/ /usr/share/nginx/html/

# nginx template: the official image runs envsubst on /etc/nginx/templates/*.template at start,
# substituting $PORT while leaving nginx runtime vars ($uri, $host) intact.
COPY deploy/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080
