FROM node:20-alpine

RUN npm install

WORKDIR /home/node/app

COPY . ./ 

USER node

CMD ["npm","run","test","&&","npm", "run", "dev"]
EXPOSE 3000
