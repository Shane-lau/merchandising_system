import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import api from '../api/axios'

function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleChange(event) {
    setForm((currentForm) => ({
      ...currentForm,
      [event.target.name]: event.target.value,
    }))
  }

  function validateForm() {
    if (!form.full_name.trim() || !form.email.trim() || !form.password || !form.confirmPassword) {
      return 'All fields are required.'
    }

    if (form.password.length < 6) {
      return 'Password must be at least 6 characters long.'
    }

    if (form.password !== form.confirmPassword) {
      return 'Passwords do not match.'
    }

    return ''
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const validationError = validateForm()

    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setSuccess('')
    setIsSubmitting(true)

    try {
      await api.post('/api/register', {
        full_name: form.full_name,
        email: form.email,
        password: form.password,
      })
      setSuccess('Registration successful. Redirecting to login...')
      setTimeout(() => navigate('/login'), 1200)
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to register. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="register-title">
        <p className="eyebrow">Public Registration</p>
        <h1 id="register-title">Create Branch Staff Account</h1>
        <p className="auth-copy">New public accounts are automatically registered as Branch Staff.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <label>
            Full Name
            <input
              type="text"
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              placeholder="Juan Dela Cruz"
              autoComplete="name"
            />
          </label>

          <label>
            Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="juan@example.com"
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
          </label>

          <label>
            Confirm Password
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Repeat your password"
              autoComplete="new-password"
            />
          </label>

          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account...' : 'Register'}
          </button>
        </form>

        <p className="switch-page">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </section>
    </main>
  )
}

export default Register
