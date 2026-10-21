import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/useAuth'

function Transactions() {
  const { user } = useAuth()
  const canChooseBranch = user.role === 'super_admin'
  const [branches, setBranches] = useState([])
  const [products, setProducts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [branchId, setBranchId] = useState(canChooseBranch ? '' : String(user.branch_id || ''))
  const [items, setItems] = useState([{ product_id: '', quantity: 1 }])
  const [filters, setFilters] = useState({ search: '', branch_id: '', status: '', date_from: '', date_to: '' })
  const [selected, setSelected] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.get('/api/products', { params: { status: 'active' } }).then((response) => setProducts(response.data.products || [])).catch(() => {})
    if (canChooseBranch) api.get('/api/branches', { params: { status: 'active' } }).then((response) => setBranches(response.data.branches || [])).catch(() => {})
  }, [canChooseBranch])

  async function loadTransactions() {
    try {
      const response = await api.get('/api/transactions', { params: { ...filters, branch_id: canChooseBranch ? filters.branch_id || undefined : user.branch_id } })
      setTransactions(response.data.transactions || [])
    } catch (requestError) { setError(requestError.response?.data?.message || 'Unable to load transactions.') }
  }
  useEffect(() => {
    let active = true
    api.get('/api/transactions', { params: { ...filters, branch_id: canChooseBranch ? filters.branch_id || undefined : user.branch_id } })
      .then((response) => { if (active) setTransactions(response.data.transactions || []) })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.message || 'Unable to load transactions.') })
    return () => { active = false }
  }, [filters, canChooseBranch, user.branch_id])

  const previewItems = useMemo(() => items.map((item) => {
    const product = products.find((entry) => String(entry.id) === String(item.product_id))
    const subtotal = product ? Number(product.price) * Number(item.quantity || 0) : 0
    return { ...item, product, subtotal }
  }), [items, products])
  const total = previewItems.reduce((sum, item) => sum + item.subtotal, 0)

  function updateItem(index, field, value) { setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item)) }
  function addItem() { setItems((current) => [...current, { product_id: '', quantity: 1 }]) }
  function removeItem(index) { setItems((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)) }

  async function submitTransaction(event) {
    event.preventDefault(); setMessage(''); setError('')
    if (!window.confirm('Complete this merchandising transaction and deduct stock?')) return
    setSubmitting(true)
    try {
      const response = await api.post('/api/transactions', { branch_id: canChooseBranch ? branchId : user.branch_id, items })
      setMessage(`Transaction ${response.data.transaction.transaction_number} completed successfully.`)
      setItems([{ product_id: '', quantity: 1 }])
      await loadTransactions()
    } catch (requestError) { setError(requestError.response?.data?.message || 'Unable to complete transaction.') } finally { setSubmitting(false) }
  }

  async function viewDetails(id) {
    setError('')
    try { const response = await api.get(`/api/transactions/${id}`); setSelected(response.data.transaction) } catch (requestError) { setError(requestError.response?.data?.message || 'Unable to load transaction details.') }
  }

  return <main className="management-page">
    <header className="page-header"><div><p className="eyebrow">Week 4</p><h1>Merchandising Transactions</h1></div><Link className="secondary-button" to="/dashboard">Dashboard</Link></header>
    {error && <div className="alert alert-error page-alert">{error}</div>}{message && <div className="alert alert-success page-alert">{message}</div>}
    <div className="content-grid"><section className="form-panel"><h2>New Transaction</h2><form className="auth-form" onSubmit={submitTransaction}>
      {canChooseBranch && <label>Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)} required><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_name}</option>)}</select></label>}
      <div className="transaction-items"><div className="list-heading"><strong>Items</strong><button type="button" className="secondary-button" onClick={addItem}>Add Item</button></div>{previewItems.map((item, index) => <div className="transaction-item" key={index}><select value={item.product_id} onChange={(event) => updateItem(index, 'product_id', event.target.value)} required><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} (PHP {Number(product.price).toFixed(2)})</option>)}</select><input type="number" min="1" step="1" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} required /><span>PHP {item.subtotal.toFixed(2)}</span>{items.length > 1 && <button type="button" onClick={() => removeItem(index)}>Remove</button>}</div>)}</div>
      <div className="transaction-total"><span>Total</span><strong>PHP {total.toFixed(2)}</strong></div><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Completing...' : 'Complete Transaction'}</button>
    </form></section>
    <section className="data-panel"><div className="list-heading"><div><h2>Transaction History</h2><p className="muted-text">Database-backed completed transactions.</p></div><div className="filters"><input placeholder="Transaction number" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />{canChooseBranch && <select value={filters.branch_id} onChange={(event) => setFilters((current) => ({ ...current, branch_id: event.target.value }))}><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_name}</option>)}</select>}<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All statuses</option><option value="completed">Completed</option><option value="voided">Voided</option></select><input type="date" value={filters.date_from} onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))} /><input type="date" value={filters.date_to} onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))} /></div></div>
      <div className="table-wrap"><table><thead><tr><th>Number</th><th>Date</th><th>Branch</th><th>Performed By</th><th>Items</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id}><td>{transaction.transaction_number}</td><td>{new Date(transaction.created_at).toLocaleString()}</td><td>{transaction.branch_name}</td><td>{transaction.performed_by_name}</td><td>{transaction.item_count}</td><td>PHP {Number(transaction.total_amount).toFixed(2)}</td><td><span className="status-badge active">{transaction.status}</span></td><td><button type="button" onClick={() => viewDetails(transaction.id)}>View</button></td></tr>)}{transactions.length === 0 && <tr><td colSpan="8">No transactions found.</td></tr>}</tbody></table></div>
    </section></div>
    {selected && <section className="data-panel section-block"><div className="list-heading"><div><p className="eyebrow">Transaction Details</p><h2>{selected.transaction_number}</h2><p className="muted-text">{selected.branch_name} | {new Date(selected.created_at).toLocaleString()}</p></div><button type="button" className="secondary-button" onClick={() => setSelected(null)}>Close</button></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Quantity</th><th>Unit Price</th><th>Subtotal</th></tr></thead><tbody>{selected.items.map((item) => <tr key={item.id}><td>{item.product_name}</td><td>{item.category}</td><td>{item.quantity}</td><td>PHP {Number(item.unit_price).toFixed(2)}</td><td>PHP {Number(item.subtotal).toFixed(2)}</td></tr>)}</tbody></table></div><div className="transaction-total"><span>Transaction Total</span><strong>PHP {Number(selected.total_amount).toFixed(2)}</strong></div></section>}
  </main>
}

export default Transactions
