import { useMemo, useState } from 'react'
import { AuthContext } from './auth-state'

function getStoredUser() {
  const storedUser = localStorage.getItem('zwmpc_user')

  if (!storedUser) {
    return null
  }

  try {
    return JSON.parse(storedUser)
  } catch {
    localStorage.removeItem('zwmpc_user')
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('zwmpc_token'))
  const [user, setUser] = useState(() => getStoredUser())

  function login(newToken, newUser) {
    localStorage.setItem('zwmpc_token', newToken)
    localStorage.setItem('zwmpc_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }

  function logout() {
    localStorage.removeItem('zwmpc_token')
    localStorage.removeItem('zwmpc_user')
    setToken(null)
    setUser(null)
  }

  const value = useMemo(
    () => ({
      user,
      token,
      login,
      logout,
      isAuthenticated: Boolean(token && user),
    }),
    [token, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
