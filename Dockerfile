FROM node:20-alpine

WORKDIR /app

COPY package*.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN mkdir -p public/images

EXPOSE 3000

CMD ["npm", "start"]
