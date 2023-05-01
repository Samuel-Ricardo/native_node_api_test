import { describe } from "node:test";
import { deepEqual, ok } from 'node:assert'
import { request } from "node:http";
import { postRequest } from "./util/utils.js";
import { BASE_URL, VALID } from "./config/config.js";

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
})
