import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/axios'

function MyBranch() {
  const [branch, setBranch] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get('/api/my-branch')
      .then((response) => { if (active) setBranch(response.data.branch) })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.message || 'Unable to load branch details.') })
    return () => { active = false }
  }, [])

  return <main className="management-page">
    <header className="page-header"><div><p className="eyebrow">My Branch</p><h1>Branch Details</h1></div><Link className="secondary-button" to="/dashboard">Dashboard</Link></header>
    {error && <div className="alert alert-error page-alert">{error}</div>}
    {branch && <section className="data-panel section-block"><div className="profile-band"><div><span>Branch Name</span><strong>{branch.branch_name}</strong></div><div><span>Branch Code</span><strong>{branch.branch_code}</strong></div><div><span>Status</span><strong>{branch.status}</strong></div><div><span>Location</span><strong>{branch.location}</strong></div></div></section>}
  </main>
}

export default MyBranch
