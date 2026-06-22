import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import * as authApi from '../api/authApi'
import { clearStoredSession, getStoredSession, saveStoredSession } from '../untils/storage'

const storedSession = getStoredSession()

const initialState = {
  user: storedSession.user,
  accessToken: storedSession.accessToken,
  status: 'idle',
  error: '',
}

function persistSession(state, payload) {
  state.user = payload.user
  state.accessToken = payload.token
  saveStoredSession({
    user: payload.user,
    accessToken: payload.token,
  })
}

export const signIn = createAsyncThunk('auth/signIn', async (payload) => {
  const response = await authApi.login(payload)
  return response.data
})

export const signUp = createAsyncThunk('auth/signUp', async (payload) => {
  const response = await authApi.register(payload)
  return response.data
})

export const restoreSession = createAsyncThunk('auth/restoreSession', async (_, { getState }) => {
  const { accessToken } = getState().auth
  if (!accessToken) return null

  const response = await authApi.getMe(accessToken)
  return {
    user: response.data.user,
    token: accessToken,
  }
})

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.user = null
      state.accessToken = ''
      state.status = 'idle'
      state.error = ''
      clearStoredSession()
    },
    clearAuthError(state) {
      state.error = ''
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(signIn.pending, (state) => {
        state.status = 'loading'
        state.error = ''
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.status = 'authenticated'
        persistSession(state, action.payload)
      })
      .addCase(signIn.rejected, (state, action) => {
        state.status = 'error'
        state.error = action.error.message || 'Login failed'
      })
      .addCase(signUp.pending, (state) => {
        state.status = 'loading'
        state.error = ''
      })
      .addCase(signUp.fulfilled, (state, action) => {
        state.status = 'authenticated'
        persistSession(state, action.payload)
      })
      .addCase(signUp.rejected, (state, action) => {
        state.status = 'error'
        state.error = action.error.message || 'Register failed'
      })
      .addCase(restoreSession.pending, (state) => {
        state.status = state.accessToken ? 'loading' : 'idle'
        state.error = ''
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        if (!action.payload) return
        state.status = 'authenticated'
        persistSession(state, action.payload)
      })
      .addCase(restoreSession.rejected, (state) => {
        state.user = null
        state.accessToken = ''
        state.status = 'idle'
        state.error = ''
        clearStoredSession()
      })
  },
})

export const { clearAuthError, logout } = authSlice.actions
export const selectAuth = (state) => state.auth
export default authSlice.reducer
