import { after, before, describe, it } from "node:test";
import { deepEqual, deepStrictEqual, ok } from 'node:assert'
import { postRequest } from "./util/utils.js";
import { BASE_URL, VALID } from "./config/config.js";
import { promises } from "node:dns";

describe('API Products Test Suit', () => {

  let _server = {}
  let _globalToken = ''

  async function successfullyPostRequest(url,data){
    const request = await postRequest(url,data,_globalToken)
    
    deepEqual(request.status, 200)
    return request.json()
  }

  async function setToken(){
    const data = await successfullyPostRequest(`${BASE_URL}/login`, VALID)
    ok(data.token, 'token should be present')

    _globalToken = data.token 
  }


  before(async () => {
    _server = (await import('./api.js')).app
    await new Promise(resolve => _server.once('listening', resolve))
  })

  before(async () => setToken())

  it ('It should create a pemiun product', async () => {
    const data = await successfullyPostRequest(`${BASE_URL}/products`, {description:"cookie", price:110})
    deepStrictEqual(data.category, "premium")
  }) 


  after(done => _server.close(done))
})
