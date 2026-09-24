import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/useAuth'

const categories = ['Clothing', 'Food', 'Household', 'Personal Care', 'Accessories', 'Other']

const initialForm = {
  name: '',
  category: 'Clothing',
  price: '0',
  quantity: '0',
  description: '',
  status: 'active',
  image: '',
}

function Products() {
  const { user } = useAuth()
  const canManage = ['super_admin', 'admin_hr'].includes(user.role)
  const [products, setProducts] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function loadProducts() {
    const response = await api.get('/api/products')
    setProducts(response.data.products || [])
  }

  useEffect(() => {
    let isMounted = true

    api
      .get('/api/products')
      .then((response) => {
        if (isMounted) {
          setProducts(response.data.products || [])
        }
      })
      .catch((requestError) => {
        if (isMounted) {
          setError(requestError.response?.data?.message || 'Unable to load products.')
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const filteredProducts = useMemo(() => {
    const cleanedSearch = search.trim().toLowerCase()

    return products.filter((product) => {
      const matchesSearch =
        !cleanedSearch ||
        product.name.toLowerCase().includes(cleanedSearch) ||
        product.category.toLowerCase().includes(cleanedSearch)
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter
      const matchesStatus = statusFilter === 'all' || product.status === statusFilter

      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [products, search, categoryFilter, statusFilter])

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
        await api.put(`/api/products/${editingId}`, form)
        setMessage('Product updated successfully.')
      } else {
        await api.post('/api/products', form)
        setMessage('Product created successfully.')
      }

      resetForm()
      await loadProducts()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save product.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function startEdit(product) {
    setEditingId(product.id)
    setForm({
      name: product.name,
      category: product.category,
      price: String(product.price),
      quantity: String(product.quantity),
      description: product.description || '',
      status: product.status,
      image: product.image || '',
    })
    setMessage('')
    setError('')
  }

  async function updateStatus(product) {
    const nextStatus = product.status === 'active' ? 'inactive' : 'active'
    setError('')
    setMessage('')

    try {
      await api.patch(`/api/products/${product.id}/status`, { status: nextStatus })
      setMessage('Product status updated successfully.')
      await loadProducts()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update product status.')
    }
  }

  return (
    <main className="management-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Week 2</p>
          <h1>Product Management</h1>
        </div>
        <Link className="secondary-button" to="/dashboard">
          Dashboard
        </Link>
      </header>

      <div className={canManage ? 'content-grid' : 'content-grid single-column'}>
        {canManage && (
          <section className="form-panel" aria-labelledby="product-form-title">
            <h2 id="product-form-title">{editingId ? 'Edit Product' : 'Add Product'}</h2>
            <form className="auth-form" onSubmit={handleSubmit}>
              {error && <div className="alert alert-error">{error}</div>}
              {message && <div className="alert alert-success">{message}</div>}

              <label>
                Product Name
                <input name="name" value={form.name} onChange={handleChange} />
              </label>

              <label>
                Category
                <select name="category" value={form.category} onChange={handleChange}>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Price
                <input min="0" step="0.01" type="number" name="price" value={form.price} onChange={handleChange} />
              </label>

              <label>
                Quantity
                <input min="0" step="1" type="number" name="quantity" value={form.quantity} onChange={handleChange} />
              </label>

              <label>
                Description
                <textarea name="description" value={form.description} onChange={handleChange} />
              </label>

              <label>
                Optional Image
                <input name="image" value={form.image} onChange={handleChange} placeholder="image-file-or-url.jpg" />
              </label>

              <label>
                Status
                <select name="status" value={form.status} onChange={handleChange}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>

              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingId ? 'Save Product' : 'Add Product'}
              </button>
              {editingId && (
                <button type="button" className="secondary-button" onClick={resetForm}>
                  Cancel Edit
                </button>
              )}
            </form>
          </section>
        )}

        <section className="data-panel" aria-labelledby="product-list-title">
          <div className="list-heading">
            <div>
              <h2 id="product-list-title">Product List</h2>
              {!canManage && <p className="muted-text">Branch Staff can view products only.</p>}
            </div>
            <div className="filters">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products"
              />
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">All Categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {!canManage && error && <div className="alert alert-error">{error}</div>}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Quantity</th>
                  <th>Status</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.category}</td>
                    <td>PHP {Number(product.price).toFixed(2)}</td>
                    <td>{product.quantity}</td>
                    <td>
                      <span className={`status-badge ${product.status}`}>{product.status}</span>
                    </td>
                    {canManage && (
                      <td>
                        <div className="row-actions">
                          <button type="button" onClick={() => startEdit(product)}>
                            Edit
                          </button>
                          <button type="button" onClick={() => updateStatus(product)}>
                            {product.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? '6' : '5'}>No products found.</td>
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

export default Products
