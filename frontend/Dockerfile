FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY *.html *.css *.js /usr/share/nginx/html/
RUN find /usr/share/nginx/html -maxdepth 1 -name '._*' -delete \
  && find /usr/share/nginx/html -maxdepth 1 -type f -exec chmod 644 {} +
