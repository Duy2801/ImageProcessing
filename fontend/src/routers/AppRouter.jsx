import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AuthPage } from '../features/auth/AuthPage'
import { AppLayout } from '../features/layout/AppLayout'
import { ProcessingPage } from '../features/pipeline/ProcessingPage'
import { ProtectedRoute } from './ProtectedRoute'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/process" replace /> },
      { path: 'auth', element: <AuthPage /> },
      {
        path: 'process',
        element: (
          <ProtectedRoute>
            <ProcessingPage />
          </ProtectedRoute>
        ),
      },
      { path: '*', element: <Navigate to="/process" replace /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
