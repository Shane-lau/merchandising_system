import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/axios'

const initialForm = {
  full_name: '',
  email: '',
  password: '',
  role: 'admin_hr',
  branch_id: '',
}

const roleLabels = {
  super_admin: 'CEO / Super Admin',
  admin_hr: 'Admin / HR',
  branch_staff: 'Branch Staff',
}

function Users() {
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState(initialForm)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function loadUsers() {
    const response = await api.get('/api/users')
    setUsers(response.data.users || [])
  }

  useEffect(() => {
    let isMounted = true

    Promise.all([api.get('/api/users'), api.get('/api/branches')])
      .then(([usersResponse, branchesResponse]) => {
        if (isMounted) {
          setUsers(usersResponse.data.users || [])
          setBranches(branchesResponse.data.branches || [])
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setError(requestError.response?.data?.message || 'Unable to load user management data.')
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  function handleChange(event) {
    const { name, value } = event.target

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
      ...(name === 'role' && value === 'admin_hr' ? { branch_id: '' } : {}),
    }))
  }

  function validateForm() {
    if (!form.full_name.trim() || !form.email.trim() || !form.password || !form.role) {
      return 'Full name, email, password, and role are required.'
    }

    if (form.password.length < 6) {
      return 'Password must be at least 6 characters long.'
    }

    if (form.role === 'branch_staff' && !form.branch_id) {
      return 'Branch Staff accounts must be assigned to a branch.'
    }

    return ''
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const validationError = validateForm()

    if (validationError) {
      setError(validationError)
      setMessage('')
      return
    }

    setIsSubmitting(true)
    setError('')
    setMessage('')

    try {
      await api.post('/api/users', {
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        role: form.role,
        branch_id: form.role === 'branch_staff' ? form.branch_id : null,
      })
      setForm(initialForm)
      setMessage('User account created successfully.')
      await loadUsers()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to create user account.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="management-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Super Admin</p>
          <h1>User Management</h1>
        </div>
        <Link className="secondary-button" to="/dashboard">
          Dashboard
        </Link>
      </header>

      <div className="content-grid">
        <section className="form-panel" aria-labelledby="create-user-title">
          <h2 id="create-user-title">Create Account</h2>
          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}
            {message && <div className="alert alert-success">{message}</div>}

            <label>
              Full Name
              <input name="full_name" value={form.full_name} onChange={handleChange} />
            </label>

            <label>
              Email
              <input type="email" name="email" value={form.email} onChange={handleChange} />
            </label>

            <label>
              Password
              <input type="password" name="password" value={form.password} onChange={handleChange} />
            </label>

            <label>
              Role
              <select name="role" value={form.role} onChange={handleChange}>
                <option value="admin_hr">Admin / HR</option>
                <option value="branch_staff">Branch Staff</option>
              </select>
            </label>

            {form.role === 'branch_staff' && (
              <label>
                Branch
                <select name="branch_id" value={form.branch_id} onChange={handleChange}>
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.branch_name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </section>

        <section className="data-panel" aria-labelledby="user-list-title">
          <h2 id="user-list-title">User List</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Branch</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.full_name}</td>
                    <td>{user.email}</td>
                    <td>{roleLabels[user.role] || user.role}</td>
                    <td>{user.branch_name || 'None'}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan="4">No users found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

export default Users
