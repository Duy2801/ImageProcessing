import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { checkHealth } from '../../api/healthApi'
import { useAuth } from '../../hooks/useAuth'
import { getApiBase, setApiBase } from '../../untils/storage'

const initialForm = {
  name: '',
  email: '',
  password: '',
}

function HealthStatus({ health }) {
  if (!health) return null

  return (
    <div className="health-grid">
      <span className={health.usersTableConfigured || health.authStore === 'local-file' ? 'ok' : 'bad'}>
        {health.authStore || 'Auth store'}
      </span>
      <span className={health.bucketConfigured ? 'ok' : 'bad'}>S3 bucket</span>
      <span className={health.pipelineConfigured ? 'ok' : 'warn'}>Pipeline URL</span>
    </div>
  )
}

export function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, status, login, register } = useAuth()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(initialForm)
  const [apiBaseInput, setApiBaseInput] = useState(getApiBase)
  const [health, setHealth] = useState(null)
  const [result, setResult] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [checkingHealth, setCheckingHealth] = useState(false)
  const loading = status === 'loading'
  const redirectTo = location.state?.from?.pathname || '/process'

  if (user) {
    return <Navigate to={redirectTo} replace />
  }

  async function handleHealthCheck() {
    setCheckingHealth(true)
    setError('')
    setNotice('')
    setApiBase(apiBaseInput)

    try {
      const data = await checkHealth()
      setHealth(data)
      setResult(data)
      setNotice('Backend dang hoat dong.')
    } catch (err) {
      setHealth(null)
      setError(err.message)
    } finally {
      setCheckingHealth(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setResult(null)
    setApiBase(apiBaseInput)

    try {
      const payload = mode === 'register'
        ? form
        : { email: form.email, password: form.password }
      const data = mode === 'register' ? await register(payload) : await login(payload)

      setResult({ success: true, data })
      setNotice(mode === 'register' ? 'Tao tai khoan thanh cong.' : 'Dang nhap thanh cong.')
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="auth-page">
      <aside className="panel auth-panel">
        <div className="panel-head">
          <h2>{mode === 'login' ? 'Login' : 'Register'}</h2>
          <div className="segmented">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Register
            </button>
          </div>
        </div>

        <label>
          Auth API
          <input value={apiBaseInput} onChange={(event) => setApiBaseInput(event.target.value)} />
        </label>
        <button className="secondary" disabled={checkingHealth || loading} type="button" onClick={handleHealthCheck}>
          {checkingHealth ? 'Checking...' : 'Check backend'}
        </button>

        <HealthStatus health={health} />

        <form className="form-stack" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label>
              Name
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Nguyen Duc Duy"
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="At least 6 characters"
            />
          </label>
          <button className="primary" disabled={loading} type="submit">
            {loading ? 'Working...' : mode === 'login' ? 'Login' : 'Create account'}
          </button>
        </form>
      </aside>

      <section className="panel response-panel auth-response">
        <div className="panel-head">
          <h2>Response</h2>
          <span className="status ready">JSON</span>
        </div>
        {notice && <div className="notice-box">{notice}</div>}
        {error && <div className="error-box">{error}</div>}
        <pre>{JSON.stringify(result || { apiBase: apiBaseInput }, null, 2)}</pre>
      </section>
    </section>
  )
}
