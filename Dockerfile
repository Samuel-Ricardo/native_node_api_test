FROM node:20-alpine

WORKDIR /home/node/app

COPY . ./ 

RUN npm install

USER node

CMD ["npm", "run", "docker:startup"]
EXPOSE 3000
