FROM node:20-alpine

WORKDIR /app

COPY backend/package.json ./package.json
RUN npm install

COPY backend/src ./src
COPY backend/scripts ./scripts
COPY db ./db

EXPOSE 4000

CMD ["npm", "run", "start"]
