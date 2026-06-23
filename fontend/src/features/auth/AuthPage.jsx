import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
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
  const [apiBaseInput] = useState(getApiBase)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const loading = status === 'loading'
  const redirectTo = location.state?.from?.pathname || '/process'

  if (user) {
    return <Navigate to={redirectTo} replace />
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
        <div className="login-brandmark">FC</div>
        <div className="login-copy">
          <span className="node-pill">Serverless image pipeline</span>
          <h1>FluxCore Engine</h1>
          <p>Authenticate, upload, transform, track and export images through a distributed AWS processing core.</p>
        </div>
        <div className="pipeline-preview" aria-hidden="true">
          <div className="preview-node active">S</div>
          <span />
          <div className="preview-node active">R</div>
          <span />
          <div className="preview-node">F</div>
          <span />
          <div className="preview-node">W</div>
          <span />
          <div className="preview-node">S3</div>
        </div>
        <div className="metric-grid">
          <div>
            <span>Runtime</span>
            <strong>Lambda</strong>
          </div>
          <div>
            <span>Queue</span>
            <strong>SQS</strong>
          </div>
          <div>
            <span>Storage</span>
            <strong>S3</strong>
          </div>
        </div>
      </div>

      <form className="login-panel" onSubmit={handleSubmit}>
        <div className="login-panel-head">
          <span>Secure access</span>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create account'}</h2>
          <p>{mode === 'login' ? 'Sign in to continue processing images.' : 'Register a workspace user for the pipeline.'}</p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Login
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Register
          </button>
        </div>

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
          {loading ? 'Connecting...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        {notice && <div className="studio-notice">{notice}</div>}
        {error && <div className="studio-error">{error}</div>}
        <p className="login-footer">Protected workspace for authenticated operators only.</p>
      </form>
    </section>
  )
}
