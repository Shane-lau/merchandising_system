import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/useAuth'

const emptyMovement = { branch_id: '', product_id: '', quantity: '', reference_number: '', notes: '' }

function Inventory() {
  const { user } = useAuth()
  const canChooseBranch = user.role !== 'branch_staff'
  const [inventory, setInventory] = useState([])
  const [movements, setMovements] = useState([])
  const [branches, setBranches] = useState([])
  const [products, setProducts] = useState([])
  const [filters, setFilters] = useState({ search: '', branch_id: '', category: '', status: '' })
  const [movement, setMovement] = useState(emptyMovement)
  const [movementType, setMovementType] = useState('stock_in')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const branchId = canChooseBranch ? filters.branch_id : user.branch_id

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const inventoryResponse = await api.get('/api/inventory', { params: { ...filters, branch_id: branchId || undefined } })
      const movementResponse = await api.get('/api/inventory/movements', { params: { branch_id: branchId || undefined } })
      setInventory(inventoryResponse.data.inventory || [])
      setMovements(movementResponse.data.movements || [])
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load inventory.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    api.get('/api/inventory', { params: { ...filters, branch_id: branchId || undefined } })
      .then((response) => { if (active) setInventory(response.data.inventory || []) })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.message || 'Unable to load inventory.') })
      .finally(() => { if (active) setLoading(false) })
    api.get('/api/inventory/movements', { params: { branch_id: branchId || undefined } })
      .then((response) => { if (active) setMovements(response.data.movements || []) })
      .catch(() => {})
    return () => { active = false }
  }, [filters, branchId])

  useEffect(() => {
    api.get('/api/products', { params: { status: 'active' } }).then((response) => setProducts(response.data.products || [])).catch(() => {})
    if (canChooseBranch) api.get('/api/branches', { params: { status: 'active' } }).then((response) => setBranches(response.data.branches || [])).catch(() => {})
  }, [canChooseBranch])

  const categories = useMemo(() => [...new Set(products.map((product) => product.category))].sort(), [products])

  function updateFilter(event) {
    setFilters((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  function updateMovement(event) {
    setMovement((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function submitMovement(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    const payload = { ...movement, branch_id: canChooseBranch ? movement.branch_id : user.branch_id }
    if (!window.confirm(`${movementType === 'stock_in' ? 'Receive' : 'Release'} this stock quantity?`)) return
    setSubmitting(true)
    try {
      const response = await api.post(`/api/inventory/${movementType === 'stock_in' ? 'stock-in' : 'stock-out'}`, payload)
      setMessage(response.data.message)
      setMovement(emptyMovement)
      await loadData()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save stock operation.')
    } finally {
      setSubmitting(false)
    }
  }

  async function updateThreshold(record) {
    const value = window.prompt(`Low-stock threshold for ${record.product_name}`, String(record.low_stock_threshold))
    if (value === null) return
    setError('')
    try {
      await api.patch(`/api/inventory/${record.id}/threshold`, { low_stock_threshold: value })
      setMessage('Low-stock threshold updated successfully.')
      await loadData()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update threshold.')
    }
  }

  return (
    <main className="management-page">
      <header className="page-header"><div><p className="eyebrow">Week 3</p><h1>Inventory Management</h1></div><Link className="secondary-button" to="/dashboard">Dashboard</Link></header>
      {error && <div className="alert alert-error page-alert">{error}</div>}
      {message && <div className="alert alert-success page-alert">{message}</div>}
      <div className="content-grid">
        <section className="form-panel"><h2>{movementType === 'stock_in' ? 'Stock-In' : 'Stock-Out'}</h2>
          <div className="segmented-control"><button type="button" className={movementType === 'stock_in' ? 'active' : ''} onClick={() => setMovementType('stock_in')}>Stock-In</button><button type="button" className={movementType === 'stock_out' ? 'active' : ''} onClick={() => setMovementType('stock_out')}>Stock-Out</button></div>
          <form className="auth-form" onSubmit={submitMovement}>
            {canChooseBranch && <label>Branch<select name="branch_id" value={movement.branch_id} onChange={updateMovement} required><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_name}</option>)}</select></label>}
            <label>Product<select name="product_id" value={movement.product_id} onChange={updateMovement} required><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
            <label>Quantity<input type="number" min="1" step="1" name="quantity" value={movement.quantity} onChange={updateMovement} required /></label>
            <label>Reference Number<input name="reference_number" value={movement.reference_number} onChange={updateMovement} /></label>
            <label>Notes<textarea name="notes" value={movement.notes} onChange={updateMovement} /></label>
            <button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Saving...' : movementType === 'stock_in' ? 'Receive Stock' : 'Release Stock'}</button>
          </form>
        </section>
        <section className="data-panel"><div className="list-heading"><div><h2>Branch Inventory</h2><p className="muted-text">{loading ? 'Loading inventory...' : `${inventory.length} inventory record(s)`}</p></div>
          <div className="filters"><input name="search" value={filters.search} onChange={updateFilter} placeholder="Search product" />
            {canChooseBranch && <select name="branch_id" value={filters.branch_id} onChange={updateFilter}><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_name}</option>)}</select>}
            <select name="category" value={filters.category} onChange={updateFilter}><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
            <select name="status" value={filters.status} onChange={updateFilter}><option value="">All stock statuses</option><option value="in_stock">In Stock</option><option value="low_stock">Low Stock</option><option value="out_of_stock">Out of Stock</option></select>
          </div></div>
          <div className="table-wrap"><table><thead><tr><th>Branch</th><th>Product</th><th>Category</th><th>Quantity</th><th>Threshold</th><th>Status</th><th>Updated</th><th>Action</th></tr></thead><tbody>
            {inventory.map((record) => <tr key={record.id}><td>{record.branch_name}</td><td>{record.product_name}</td><td>{record.category}</td><td>{record.quantity}</td><td>{record.low_stock_threshold}</td><td><span className={`status-badge ${record.stock_status}`}>{record.stock_status.replaceAll('_', ' ')}</span></td><td>{new Date(record.updated_at).toLocaleString()}</td><td><button type="button" onClick={() => updateThreshold(record)}>Threshold</button></td></tr>)}
            {!loading && inventory.length === 0 && <tr><td colSpan="8">No inventory records match the selected filters.</td></tr>}
          </tbody></table></div>
        </section>
      </div>
      <section className="data-panel section-block"><div className="list-heading"><div><p className="eyebrow">Audit Trail</p><h2>Stock Movement History</h2></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Branch</th><th>Product</th><th>Type</th><th>Quantity</th><th>Reference</th><th>Performed By</th><th>Notes</th></tr></thead><tbody>{movements.map((item) => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString()}</td><td>{item.branch_name}</td><td>{item.product_name}</td><td>{item.movement_type.replaceAll('_', ' ')}</td><td>{item.quantity}</td><td>{item.reference_number || '-'}</td><td>{item.performed_by_name}</td><td>{item.notes || '-'}</td></tr>)}{movements.length === 0 && <tr><td colSpan="8">No stock movements recorded yet.</td></tr>}</tbody></table></div></section>
    </main>
  )
}

export default Inventory
