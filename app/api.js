import { once } from "node:events";
import { createServer } from "node:http";

import { TOKEN_KEY, VALID } from "./config/config.js";
import { INVALID_USER_ERROR } from "./config/errors.js";

import jwt from "jsonwebtoken";


async function loginRoute(request, response) {
  const { user, password } = JSON.parse(await once(request, "data"))
  if (user !== VALID.user || password !== VALID.password) {
    response.writeHead(400)
    return response.end(JSON.stringify(INVALID_USER_ERROR))
  }

  const token = jsonwebtoken.sign({ user, message: 'heyduude' }, TOKEN_KEY)

  response.end(JSON.stringify({ token }))
}



async function handler(req, res) {
  res.send({HI:" :D"})
}

const app = createServer(handler).listen(3000, () =>  console.log("listening to 3000"));

export { app };
