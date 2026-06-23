const appSyncEndpoint = import.meta.env.VITE_APPSYNC_ENDPOINT || ''
const appSyncApiKey = import.meta.env.VITE_APPSYNC_API_KEY || ''

function base64Url(value) {
  return btoa(value)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function realtimeEndpoint(endpoint) {
  const url = new URL(endpoint)
  url.hostname = url.hostname.replace('appsync-api', 'appsync-realtime-api')
  url.protocol = 'wss:'
  url.pathname = '/graphql/realtime'
  return url
}

export function hasRealtimeConfig() {
  return Boolean(appSyncEndpoint && appSyncApiKey)
}

export function subscribePipelineProgress({ userId, onEvent, onStatus, onError }) {
  if (!hasRealtimeConfig()) {
    onStatus?.('Realtime config missing')
    return () => {}
  }

  const endpoint = realtimeEndpoint(appSyncEndpoint)
  const authHeader = {
    host: new URL(appSyncEndpoint).host,
    'x-api-key': appSyncApiKey,
  }
  endpoint.searchParams.set('header', base64Url(JSON.stringify(authHeader)))
  endpoint.searchParams.set('payload', base64Url('{}'))

  const socket = new WebSocket(endpoint.toString(), 'graphql-ws')
  const subscriptionId = `sub-${Date.now()}`
  const query = `
    subscription OnProgressUpdate($userId: String!) {
      onProgressUpdate(userId: $userId) {
        jobId
        imageId
        userId
        eventType
        status
        timestamp
        metadata
      }
    }
  `

  socket.onopen = () => {
    onStatus?.('Connecting')
    socket.send(JSON.stringify({ type: 'connection_init' }))
  }

  socket.onmessage = (message) => {
    const payload = JSON.parse(message.data)

    if (payload.type === 'connection_ack') {
      onStatus?.('Live')
      socket.send(JSON.stringify({
        id: subscriptionId,
        type: 'start',
        payload: {
          data: JSON.stringify({
            query,
            variables: { userId },
          }),
          extensions: {
            authorization: authHeader,
          },
        },
      }))
      return
    }

    if (payload.type === 'data') {
      const event = payload.payload?.data?.onProgressUpdate
      if (event) onEvent?.(event)
      return
    }

    if (payload.type === 'error') {
      onError?.(payload.payload || payload)
    }
  }

  socket.onerror = (event) => {
    onStatus?.('Disconnected')
    onError?.(event)
  }

  socket.onclose = () => {
    onStatus?.('Disconnected')
  }

  return () => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ id: subscriptionId, type: 'stop' }))
    }
    socket.close()
  }
}
