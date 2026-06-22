import { apiRequest } from './httpClient'

export function checkHealth() {
  return apiRequest('/health', {
    method: 'GET',
  })
}
