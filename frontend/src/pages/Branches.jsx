import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/axios'

const initialForm = {
  branch_name: '',
  branch_code: '',
  location: '',
  status: 'active',
}

function Branches() {
  const [branches, setBranches] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function loadBranches() {
    const response = await api.get('/api/branches')
    setBranches(response.data.branches || [])
  }

  useEffect(() => {
    let isMounted = true

    api
      .get('/api/branches')
      .then((response) => {
        if (isMounted) {
          setBranches(response.data.branches || [])
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setError(requestError.response?.data?.message || 'Unable to load branches.')
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const filteredBranches = useMemo(() => {
    const cleanedSearch = search.trim().toLowerCase()

    return branches.filter((branch) => {
      const matchesSearch =
        !cleanedSearch ||
        branch.branch_name.toLowerCase().includes(cleanedSearch) ||
        branch.branch_code.toLowerCase().includes(cleanedSearch) ||
        branch.location.toLowerCase().includes(cleanedSearch)
      const matchesStatus = statusFilter === 'all' || branch.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [branches, search, statusFilter])

  function handleChange(event) {
    setForm((currentForm) => ({
      ...currentForm,
      [event.target.name]: event.target.value,
    }))
  }

  function resetForm() {
    setForm(initialForm)
    setEditingId(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    setMessage('')

    try {
      if (editingId) {
        await api.put(`/api/branches/${editingId}`, form)
        setMessage('Branch updated successfully.')
      } else {
        await api.post('/api/branches', form)
        setMessage('Branch created successfully.')
      }

      resetForm()
      await loadBranches()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save branch.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function startEdit(branch) {
    setEditingId(branch.id)
    setForm({
      branch_name: branch.branch_name,
      branch_code: branch.branch_code,
      location: branch.location,
      status: branch.status,
    })
    setMessage('')
    setError('')
  }

  async function updateStatus(branch) {
    const nextStatus = branch.status === 'active' ? 'inactive' : 'active'
    setError('')
    setMessage('')

    try {
      await api.patch(`/api/branches/${branch.id}/status`, { status: nextStatus })
      setMessage('Branch status updated successfully.')
      await loadBranches()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update branch status.')
    }
  }

  return (
    <main className="management-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Week 2</p>
          <h1>Branch Management</h1>
        </div>
        <Link className="secondary-button" to="/dashboard">
          Dashboard
        </Link>
      </header>

      <div className="content-grid">
        <section className="form-panel" aria-labelledby="branch-form-title">
          <h2 id="branch-form-title">{editingId ? 'Edit Branch' : 'Add Branch'}</h2>
          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}
            {message && <div className="alert alert-success">{message}</div>}

            <label>
              Branch Name
              <input name="branch_name" value={form.branch_name} onChange={handleChange} />
            </label>

            <label>
              Branch Code
              <input name="branch_code" value={form.branch_code} onChange={handleChange} />
            </label>

            <label>
              Location
              <input name="location" value={form.location} onChange={handleChange} />
            </label>

            <label>
              Status
              <select name="status" value={form.status} onChange={handleChange}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingId ? 'Save Branch' : 'Add Branch'}
            </button>
            {editingId && (
              <button type="button" className="secondary-button" onClick={resetForm}>
                Cancel Edit
              </button>
            )}
          </form>
        </section>

        <section className="data-panel" aria-labelledby="branch-list-title">
          <div className="list-heading">
            <h2 id="branch-list-title">Branch List</h2>
            <div className="filters">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search branches"
              />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBranches.map((branch) => (
                  <tr key={branch.id}>
                    <td>{branch.branch_name}</td>
                    <td>{branch.branch_code}</td>
                    <td>{branch.location}</td>
                    <td>
                      <span className={`status-badge ${branch.status}`}>{branch.status}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button type="button" onClick={() => startEdit(branch)}>
                          Edit
                        </button>
                        <button type="button" onClick={() => updateStatus(branch)}>
                          {branch.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredBranches.length === 0 && (
                  <tr>
                    <td colSpan="5">No branches found.</td>
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

export default Branches
