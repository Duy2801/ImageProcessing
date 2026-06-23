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

export function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, status, login, register } = useAuth()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState(initialForm)
  const [apiBaseInput, setApiBaseInput] = useState(getApiBase)
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
      await checkHealth()
      setNotice('Gateway online. Core services reachable.')
    } catch (err) {
      setError(err.message)
    } finally {
      setCheckingHealth(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setApiBase(apiBaseInput)

    try {
      const payload = mode === 'register'
        ? form
        : { email: form.email, password: form.password }
      await (mode === 'register' ? register(payload) : login(payload))
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="login-console">
      <div className="login-hero">
        <span className="node-pill">Node status: operational</span>
        <h1>FluxCore Engine</h1>
        <p>High-performance image processing pipeline for distributed serverless architecture.</p>
        <div className="metric-grid">
          <div>
            <span>Throughput</span>
            <strong>482 GB/s</strong>
          </div>
          <div>
            <span>Latency</span>
            <strong>12.4ms</strong>
          </div>
        </div>
        <small>Infrastructure status: Global distributor active</small>
      </div>

      <form className="login-panel" onSubmit={handleSubmit}>
        <div>
          <h2>Initialize Session</h2>
          <p>Enter your engineering credentials to access the core.</p>
        </div>

        <div className="login-provider-row">
          <button type="button" onClick={handleHealthCheck} disabled={checkingHealth}>
            {checkingHealth ? 'Checking...' : 'Gateway'}
          </button>
          <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Create account' : 'Login'}
          </button>
        </div>

        <label>
          API Gateway
          <input value={apiBaseInput} onChange={(event) => setApiBaseInput(event.target.value)} />
        </label>

        {mode === 'register' && (
          <label>
            Node name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
        )}

        <label>
          Work email
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </label>
        <label>
          Access key
          <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        </label>

        <button className="login-submit" disabled={loading} type="submit">
          {loading ? 'Establishing...' : 'Establish Connection'}
        </button>

        {notice && <div className="studio-notice">{notice}</div>}
        {error && <div className="studio-error">{error}</div>}
        <p className="login-footer">Unauthorized access is prohibited.</p>
      </form>
    </section>
  )
}
