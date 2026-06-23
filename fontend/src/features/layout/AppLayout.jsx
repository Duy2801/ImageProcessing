import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export function AppLayout() {
  const { user, accessToken, logout, restoreSession } = useAuth()
  const location = useLocation()
  const isAuthPage = location.pathname === '/auth'

  useEffect(() => {
    if (!accessToken) return
    restoreSession().catch(() => {})
  }, [accessToken, restoreSession])

  return (
    <main className={`app-shell ${isAuthPage ? 'auth-shell' : ''}`}>
      {!isAuthPage && (
        <section className="topbar">
          <div>
            <p className="eyebrow">FluxCore Engine</p>
            <h1>Image Processor Console</h1>
          </div>

          <nav className="app-nav" aria-label="Primary navigation">
            <NavLink to="/process">Process</NavLink>
            {!user && <NavLink to="/auth">Login</NavLink>}
            {user && (
              <div className="user-menu">
                <span>{user.name}</span>
                <button type="button" onClick={logout}>Logout</button>
              </div>
            )}
          </nav>
        </section>
      )}

      <Outlet />
    </main>
  )
}
