export async function postRequest(url, data, token) {
  const request = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(data),
    headers{authorization: token}
  })
}
