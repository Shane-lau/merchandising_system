import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/useAuth'

const roleLabels = { super_admin: 'CEO / Super Admin', admin_hr: 'Admin / HR', branch_staff: 'Branch Staff' }

function Dashboard() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [summary, setSummary] = useState(null)
  const [branches, setBranches] = useState([])
  const [activity, setActivity] = useState({ movements: [], transactions: [] })
  const [error, setError] = useState('')

  async function loadDashboard() {
    setError('')
    try {
      const [summaryResponse, branchesResponse, activityResponse] = await Promise.all([
        api.get('/api/dashboard/summary'), api.get('/api/dashboard/branches'), api.get('/api/dashboard/activity'),
      ])
      setSummary(summaryResponse.data.summary)
      setBranches(branchesResponse.data.branches || [])
      setActivity(activityResponse.data || { movements: [], transactions: [] })
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load the monitoring dashboard.')
    }
  }

  useEffect(() => {
    let active = true
    Promise.all([api.get('/api/dashboard/summary'), api.get('/api/dashboard/branches'), api.get('/api/dashboard/activity')])
      .then(([summaryResponse, branchesResponse, activityResponse]) => {
        if (!active) return
        setSummary(summaryResponse.data.summary)
        setBranches(branchesResponse.data.branches || [])
        setActivity(activityResponse.data || { movements: [], transactions: [] })
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Unable to load the monitoring dashboard.')
      })
    return () => { active = false }
  }, [])
  function handleLogout() { logout(); navigate('/login', { replace: true }) }
  const links = user.role === 'super_admin'
    ? [['User Management', '/users'], ['Branch Management', '/branches'], ['Product Management', '/products'], ['Inventory Management', '/inventory'], ['Transactions', '/transactions']]
    : user.role === 'admin_hr'
      ? [['Branch Management', '/branches'], ['Product Management', '/products'], ['Inventory', '/inventory'], ['Transactions', '/transactions']]
      : [['Products', '/products'], ['My Branch Inventory', '/inventory'], ['Transactions', '/transactions']]

  return <main className="dashboard-page">
    <header className="dashboard-header"><div><p className="eyebrow">ZWMPC</p><h1>Centralized Monitoring Dashboard</h1></div><div className="header-actions"><button type="button" className="secondary-button" onClick={loadDashboard}>Refresh</button><button type="button" className="secondary-button" onClick={handleLogout}>Logout</button></div></header>
    <section className="profile-band"><div><span>Full Name</span><strong>{user.full_name}</strong></div><div><span>Role</span><strong>{roleLabels[user.role] || user.role}</strong></div><div><span>{user.role === 'branch_staff' ? 'Assigned Branch' : 'Monitoring Scope'}</span><strong>{user.role === 'branch_staff' ? (branches[0]?.branch_name || 'Branch assignment required') : 'All branches'}</strong></div></section>
    {error && <div className="alert alert-error page-alert">{error}</div>}
    {!summary && !error && <p className="muted-text">Loading current monitoring data...</p>}
    {summary && <>
      <section className="metric-grid"><div className="metric-card"><span>Total Units</span><strong>{summary.total_inventory_units || 0}</strong></div><div className="metric-card"><span>Low Stock</span><strong>{summary.low_stock_items || 0}</strong></div><div className="metric-card"><span>Out of Stock</span><strong>{summary.out_of_stock_items || 0}</strong></div><div className="metric-card"><span>Transactions Today</span><strong>{summary.transactions_today || 0}</strong></div><div className="metric-card"><span>Sales Today</span><strong>PHP {Number(summary.sales_today || 0).toFixed(2)}</strong></div>{user.role !== 'branch_staff' && <><div className="metric-card"><span>Active Branches</span><strong>{summary.active_branches || 0}</strong></div><div className="metric-card"><span>Active Products</span><strong>{summary.total_active_products || 0}</strong></div></>}</section>
      <section className="section-block"><div className="section-heading"><div><p className="eyebrow">Operations</p><h2>Quick Access</h2></div></div><div className="module-grid">{links.map(([label, path]) => <Link className="module-card" key={path} to={path}>{label}</Link>)}</div></section>
      <section className="section-block data-panel"><div className="section-heading"><div><p className="eyebrow">Current Stock</p><h2>Branch Inventory Overview</h2></div></div><div className="table-wrap"><table><thead><tr><th>Branch</th><th>Status</th><th>Inventory Records</th><th>Total Units</th><th>Low Stock</th><th>Out of Stock</th><th>Latest Update</th></tr></thead><tbody>{branches.map((branch) => <tr key={branch.id}><td>{branch.branch_name}</td><td><span className={`status-badge ${branch.status}`}>{branch.status}</span></td><td>{branch.inventory_records}</td><td>{branch.total_units}</td><td>{branch.low_stock_count || 0}</td><td>{branch.out_of_stock_count || 0}</td><td>{branch.latest_inventory_activity ? new Date(branch.latest_inventory_activity).toLocaleString() : '-'}</td></tr>)}{branches.length === 0 && <tr><td colSpan="7">No branch monitoring data is available.</td></tr>}</tbody></table></div></section>
      <section className="activity-grid section-block"><section className="data-panel"><p className="eyebrow">Recent Stock Activity</p><h2>Movements</h2><div className="activity-list">{activity.movements.map((item) => <div className="activity-row" key={item.id}><strong>{item.movement_type.replaceAll('_', ' ')}: {item.product_name}</strong><span>{item.branch_name} | {item.quantity} units</span><small>{new Date(item.created_at).toLocaleString()} by {item.performed_by_name}</small></div>)}{activity.movements.length === 0 && <p className="muted-text">No stock movement activity yet.</p>}</div></section><section className="data-panel"><p className="eyebrow">Recent Sales</p><h2>Transactions</h2><div className="activity-list">{activity.transactions.map((item) => <div className="activity-row" key={item.id}><strong>{item.transaction_number}</strong><span>{item.branch_name} | PHP {Number(item.total_amount).toFixed(2)}</span><small>{new Date(item.created_at).toLocaleString()} by {item.performed_by_name}</small></div>)}{activity.transactions.length === 0 && <p className="muted-text">No completed transactions yet.</p>}</div></section></section>
    </>}
  </main>
}

export default Dashboard
