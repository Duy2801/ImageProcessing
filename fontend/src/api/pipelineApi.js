import { apiRequest } from './httpClient'

export function processExistingImage({ accessToken, s3Key, options }) {
  return apiRequest('/api/pipeline/process', {
    method: 'POST',
    token: accessToken,
    body: { s3Key, options },
  })
}

export function uploadAndProcessImage({ accessToken, file, options }) {
  const body = new FormData()
  body.append('image', file)
  body.append('options', JSON.stringify(options))

  return apiRequest('/api/pipeline/upload-and-process', {
    method: 'POST',
    token: accessToken,
    body,
  })
}
