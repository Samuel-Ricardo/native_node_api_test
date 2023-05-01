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


async function createProductRoute(request, response) {
  const {description, price} = JSON.parse(await once(request, "data"))

const categories = {
      premium: {
        from: 101,
        to: 500
      },
      regular: {
        from: 51,
        to: 100
      },
      basic: {
        from: 0,
        to: 50
      },
  }

  const category = Object.keys(categories).find(key => {
    const category = category[key]
    return price >= category.from && price <= category.to
  })

  response.end(JSON.stringify({category}))
}


async function handler(req, res) {
  res.send({HI:" :D"})
}

const app = createServer(handler).listen(3000, () =>  console.log("listening to 3000"));

export { app };
