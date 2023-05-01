export async function postRequest(url, data, token) {
  return await fetch(url, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: {authorization: token}
  })
}
