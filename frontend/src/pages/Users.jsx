import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/useAuth'

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
  const { user: currentUser } = useAuth()
  const isSuperAdmin = currentUser.role === 'super_admin'
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

    const requests = [api.get('/api/users')]
    if (isSuperAdmin) requests.push(api.get('/api/branches'))
    Promise.all(requests)
      .then(([usersResponse, branchesResponse]) => {
        if (isMounted) {
          setUsers(usersResponse.data.users || [])
          setBranches(branchesResponse?.data?.branches || [])
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
  }, [isSuperAdmin])

  function handleChange(event) {
    const { name, value } = event.target

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }))
  }

  function validateForm() {
    if (!form.full_name.trim() || !form.email.trim() || !form.password || !form.role) {
      return 'Full name, email, password, and role are required.'
    }

    if (form.password.length < 6) {
      return 'Password must be at least 6 characters long.'
    }

    if (isSuperAdmin && !form.branch_id) {
      return 'Select an active branch for this account.'
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
        role: isSuperAdmin ? form.role : 'branch_staff',
        branch_id: isSuperAdmin ? form.branch_id : undefined,
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

  async function updateBranchAssignment(user, branchId) {
    if (!branchId || !window.confirm(`Assign ${user.full_name} to the selected branch?`)) return
    setError('')
    setMessage('')
    try {
      await api.patch(`/api/users/${user.id}`, { branch_id: branchId })
      setMessage('Branch assignment updated successfully.')
      await loadUsers()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update branch assignment.')
    }
  }

  return (
    <main className="management-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{isSuperAdmin ? 'Super Admin' : 'Branch Administration'}</p>
          <h1>{isSuperAdmin ? 'User Management' : 'Branch Staff Management'}</h1>
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
              {isSuperAdmin ? <select name="role" value={form.role} onChange={handleChange}><option value="admin_hr">Admin / HR</option><option value="branch_staff">Branch Staff</option></select> : <input value="Branch Staff" disabled />}
            </label>

            {isSuperAdmin && (
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
          <h2 id="user-list-title">{isSuperAdmin ? 'User List' : 'My Branch Staff'}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Branch</th>
                  {isSuperAdmin && <th>Assignment</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.full_name}</td>
                    <td>{user.email}</td>
                    <td>{roleLabels[user.role] || user.role}</td>
                    <td>{user.branch_name || 'Unassigned'}</td>
                    {isSuperAdmin && <td>{user.role === 'super_admin' ? 'CEO account' : <select value={user.branch_id || ''} onChange={(event) => updateBranchAssignment(user, event.target.value)}><option value="">Unassigned</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_name}</option>)}</select>}</td>}
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={isSuperAdmin ? '5' : '4'}>No users found.</td>
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
