import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import Branches from './pages/Branches'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Products from './pages/Products'
import Register from './pages/Register'
import RoleTestPage from './pages/RoleTestPage'
import Users from './pages/Users'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route
              path="/staff-test"
              element={<RoleTestPage title="Staff Test" endpoint="/api/staff-test" />}
            />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['super_admin', 'admin_hr']} />}>
            <Route path="/branches" element={<Branches />} />
            <Route
              path="/admin-test"
              element={<RoleTestPage title="Admin / HR Test" endpoint="/api/admin-test" />}
            />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
            <Route path="/users" element={<Users />} />
            <Route
              path="/super-admin-test"
              element={<RoleTestPage title="Super Admin Test" endpoint="/api/super-admin-test" />}
            />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
