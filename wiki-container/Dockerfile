FROM node:20-alpine

WORKDIR /app

# Git is required by the autosave sync process.
# sqlite provides the local auth user database.
RUN apk add --no-cache git sqlite

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 8080

CMD ["node", "server.js"]
