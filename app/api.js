import { once } from "node:events";
import { createServer } from "node:http";

import { TOKEN_KEY, VALID } from "./config/config.js";
import { INVALID_USER_ERROR } from "./config/errors.js";

import jwt from "jsonwebtoken";

async function handler(req, res) {
  return ":D";
}

const app = createServer(handler).listen(3000, () =>  console.log("listening to 3000"));

export { app };
