import { useEffect, useState } from 'react'
import { hasRealtimeConfig, subscribePipelineProgress } from '../api/realtimeApi'

export function usePipelineRealtime({ userId, onProgress }) {
  const [status, setStatus] = useState(hasRealtimeConfig() ? 'Connecting' : 'Config missing')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userId || !hasRealtimeConfig()) return undefined

    return subscribePipelineProgress({
      userId,
      onStatus: setStatus,
      onError: (nextError) => setError(typeof nextError === 'string' ? nextError : JSON.stringify(nextError)),
      onEvent: onProgress,
    })
  }, [onProgress, userId])

  return {
    status,
    error,
    enabled: hasRealtimeConfig(),
  }
}
