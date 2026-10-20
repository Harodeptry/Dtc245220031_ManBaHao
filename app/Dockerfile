FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=production
COPY . .
# Bảo mật: Chạy với user node, không chạy bằng root
USER node
EXPOSE 3000
CMD ["node", "server.js"]
