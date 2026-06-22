import { useEffect, useMemo } from 'react'

export function useObjectUrl(file) {
  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file])

  useEffect(() => {
    if (!objectUrl) return undefined
    return () => URL.revokeObjectURL(objectUrl)
  }, [objectUrl])

  return objectUrl
}
