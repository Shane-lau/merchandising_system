import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

const roleLabels = {
  super_admin: 'CEO / Super Admin',
  admin_hr: 'Admin / HR',
  branch_staff: 'Branch Staff',
}

const roleSections = {
  super_admin: [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'User Management', path: '/users' },
    { label: 'Branch Management', path: '/branches' },
    { label: 'Product Management', path: '/products' },
    { label: 'Inventory Management' },
    { label: 'Transactions' },
    { label: 'Reports' },
    { label: 'Product & Sales Analytics' },
  ],
  admin_hr: [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Employee Management' },
    { label: 'Branch Staff' },
    { label: 'Branch Management', path: '/branches' },
    { label: 'Product Management', path: '/products' },
    { label: 'Inventory' },
    { label: 'Transactions' },
    { label: 'Reports' },
  ],
  branch_staff: [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'My Branch' },
    { label: 'Products', path: '/products' },
    { label: 'My Branch Inventory' },
    { label: 'Stock-In' },
    { label: 'Stock-Out' },
    { label: 'Transactions' },
    { label: 'Branch Reports' },
  ],
}

function Dashboard() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const dashboardSections = roleSections[user.role] || []

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">ZWMPC</p>
          <h1>Centralized Real-Time Merchandising Monitoring and Management System</h1>
        </div>
        <button type="button" className="secondary-button" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <section className="profile-band" aria-label="Logged-in user">
        <div>
          <span>Full Name</span>
          <strong>{user.full_name}</strong>
        </div>
        <div>
          <span>Email</span>
          <strong>{user.email}</strong>
        </div>
        <div>
          <span>Role</span>
          <strong>{roleLabels[user.role] || user.role}</strong>
        </div>
      </section>

      <section className="section-block" aria-labelledby="week-one-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Week 2</p>
            <h2 id="week-one-title">Role-Based Navigation</h2>
          </div>
        </div>

        <div className="module-grid">
          {dashboardSections.map((section) => (
            section.path ? (
              <Link className="module-card" key={section.label} to={section.path}>
                {section.label}
              </Link>
            ) : (
              <button type="button" className="module-card is-placeholder" key={section.label}>
                {section.label}
              </button>
            )
          ))}
        </div>
      </section>

      <section className="section-block" aria-labelledby="role-test-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Protected API Checks</p>
            <h2 id="role-test-title">Role Test Routes</h2>
          </div>
        </div>

        <div className="test-links">
          <Link to="/super-admin-test">Super Admin Test</Link>
          <Link to="/admin-test">Admin / HR Test</Link>
          <Link to="/staff-test">Staff Test</Link>
        </div>
      </section>
    </main>
  )
}

export default Dashboard
