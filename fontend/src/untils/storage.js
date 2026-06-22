const AUTH_STORAGE_KEY = 'authSession'
const API_BASE_STORAGE_KEY = 'apiBase'

export const defaultApiBase = import.meta.env.VITE_API_GATEWAY_URL
  || import.meta.env.VITE_AUTH_API_URL
  || 'http://localhost:4000'

export function normalizeApiBase(value) {
  return String(value || defaultApiBase).trim().replace(/\/+$/, '')
}

export function getApiBase() {
  return normalizeApiBase(localStorage.getItem(API_BASE_STORAGE_KEY) || defaultApiBase)
}

export function setApiBase(value) {
  const nextValue = normalizeApiBase(value)
  localStorage.setItem(API_BASE_STORAGE_KEY, nextValue)
  return nextValue
}

export function getStoredSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    return raw ? JSON.parse(raw) : { user: null, accessToken: '' }
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    return { user: null, accessToken: '' }
  }
}

export function saveStoredSession(session) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}
