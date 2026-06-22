import { getApiBase } from '../untils/storage'

const gatewayApiKey = import.meta.env.VITE_API_GATEWAY_KEY || ''

async function parseResponse(response) {
  const text = await response.text()
  let data

  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed with ${response.status}`)
  }

  return data
}

export async function apiRequest(path, options = {}) {
  const { token, headers, body, ...requestOptions } = options
  const isFormData = body instanceof FormData

  const requestHeaders = {
    ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(gatewayApiKey ? { 'X-Api-Key': gatewayApiKey } : {}),
    ...headers,
  }

  const response = await fetch(`${getApiBase()}${path}`, {
    ...requestOptions,
    headers: requestHeaders,
    body: isFormData || typeof body === 'string' ? body : JSON.stringify(body),
  })

  return parseResponse(response)
}
