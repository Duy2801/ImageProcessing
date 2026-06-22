import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function ProtectedRoute({ children }) {
  const location = useLocation()
  const { accessToken } = useAuth()

  if (!accessToken) {
    return <Navigate to="/auth" replace state={{ from: location }} />
  }

  return children
}
