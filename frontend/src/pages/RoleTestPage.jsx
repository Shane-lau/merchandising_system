import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/axios'

function RoleTestPage({ title, endpoint }) {
  const [status, setStatus] = useState('Checking authorization...')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    let isMounted = true

    api
      .get(endpoint)
      .then((response) => {
        if (isMounted) {
          setStatus(response.data.message)
          setIsError(false)
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setStatus(requestError.response?.data?.message || 'Unable to check this route.')
          setIsError(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [endpoint])

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="role-test-title">
        <p className="eyebrow">Role Authorization</p>
        <h1 id="role-test-title">{title}</h1>
        <div className={isError ? 'alert alert-error' : 'alert alert-success'}>{status}</div>
        <Link className="text-link" to="/dashboard">
          Back to dashboard
        </Link>
      </section>
    </main>
  )
}

export default RoleTestPage
