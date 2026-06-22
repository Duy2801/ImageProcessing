import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { logout, restoreSession, selectAuth, signIn, signUp } from '../reducer/authSlice'

export function useAuth() {
  const dispatch = useDispatch()
  const auth = useSelector(selectAuth)
  const login = useCallback((payload) => dispatch(signIn(payload)).unwrap(), [dispatch])
  const register = useCallback((payload) => dispatch(signUp(payload)).unwrap(), [dispatch])
  const restore = useCallback(() => dispatch(restoreSession()).unwrap(), [dispatch])
  const signOut = useCallback(() => dispatch(logout()), [dispatch])

  return {
    ...auth,
    login,
    register,
    restoreSession: restore,
    logout: signOut,
  }
}
