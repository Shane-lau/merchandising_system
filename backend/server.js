require('dotenv').config()

const express = require('express')
const cors = require('cors')
const mysql = require('mysql2')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { randomUUID } = require('crypto')

const app = express()
const PORT = process.env.PORT || 5000
const JWT_SECRET = process.env.JWT_SECRET

app.use(cors())
app.use(express.json())

// Replace lines 15–20 in your server.js with this:
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
})

const allowedUserRoles = ['admin_hr', 'branch_staff']
const validStatuses = ['active', 'inactive']

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0
}

function isNonNegativeInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) >= 0
}

function getAuthorizedBranchId(req, requestedBranchId) {
  if (req.user.role !== 'branch_staff') {
    return isPositiveInteger(requestedBranchId) ? Number(requestedBranchId) : null
  }

  if (!isPositiveInteger(req.user.branch_id)) {
    return { error: 'Your account must be assigned to a branch before using this feature.' }
  }

  if (requestedBranchId && Number(requestedBranchId) !== Number(req.user.branch_id)) {
    return { error: 'You can access inventory and transactions for your assigned branch only.' }
  }

  return Number(req.user.branch_id)
}

function getActiveBranch(connection, branchId, callback) {
  connection.query(
    'SELECT id, branch_name, branch_code, status FROM branches WHERE id = ? LIMIT 1',
    [branchId],
    (error, branches) => {
      if (error) return callback(error)
      if (branches.length === 0) return callback(null, null)
      if (branches[0].status !== 'active') return callback(null, { inactive: true })
      return callback(null, branches[0])
    },
  )
}

function rollbackAndRespond(connection, res, status, message) {
  connection.rollback(() => {
    connection.release()
    res.status(status).json({ message })
  })
}

function buildSafeUser(user) {
  return {
    id: user.id || user.user_id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    branch_id: user.branch_id || null,
    branch_name: user.branch_name || null,
  }
}

function signToken(user) {
  return jwt.sign(
    {
      user_id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      branch_id: user.branch_id || null,
    },
    JWT_SECRET,
    { expiresIn: '1d' },
  )
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.split(' ')[0] === 'Bearer' ? authHeader.split(' ')[1] : null

  if (!token) {
    return res.status(401).json({ message: 'Access denied. Token is required.' })
  }

  jwt.verify(token, JWT_SECRET, (error, decodedUser) => {
    if (error) {
      return res.status(401).json({ message: 'Invalid or expired token.' })
    }

    req.user = {
      id: decodedUser.user_id,
      user_id: decodedUser.user_id,
      full_name: decodedUser.full_name,
      email: decodedUser.email,
      role: decodedUser.role,
      branch_id: decodedUser.branch_id || null,
    }
    next()
  })
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden. You do not have permission to access this resource.' })
    }

    next()
  }
}

function createBranchesTable(next) {
  const sql = `
    CREATE TABLE IF NOT EXISTS branches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      branch_name VARCHAR(100) NOT NULL,
      branch_code VARCHAR(50) NOT NULL UNIQUE,
      location VARCHAR(255) NOT NULL,
      status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `

  db.query(sql, (error) => {
    if (error) {
      console.error('Error ensuring branches table:', error.message)
      process.exit(1)
    }

    next()
  })
}

function createUsersTable(next) {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(150) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('super_admin', 'admin_hr', 'branch_staff') NOT NULL DEFAULT 'branch_staff',
      branch_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `

  db.query(sql, (error) => {
    if (error) {
      console.error('Error ensuring users table:', error.message)
      process.exit(1)
    }

    next()
  })
}

function createProductsTable(next) {
  const sql = `
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      category VARCHAR(100) NOT NULL,
      price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      quantity INT NOT NULL DEFAULT 0,
      description TEXT,
      status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      image VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `

  db.query(sql, (error) => {
    if (error) {
      console.error('Error ensuring products table:', error.message)
      process.exit(1)
    }

    next()
  })
}

function ensureUsersBranchColumn(next) {
  db.query('SHOW COLUMNS FROM users LIKE ?', ['branch_id'], (error, columns) => {
    if (error) {
      console.error('Error checking users.branch_id:', error.message)
      process.exit(1)
    }

    if (columns.length > 0) {
      next()
      return
    }

    const sql = `
      ALTER TABLE users
      ADD COLUMN branch_id INT NULL,
      ADD CONSTRAINT fk_users_branch
      FOREIGN KEY (branch_id) REFERENCES branches(id)
      ON DELETE SET NULL
    `

    db.query(sql, (alterError) => {
      if (alterError) {
        console.error('Error adding users.branch_id:', alterError.message)
        process.exit(1)
      }

      next()
    })
  })
}

function ensureDatabaseFoundation(next) {
  createUsersTable(() => {
    createBranchesTable(() => {
      createProductsTable(() => {
        ensureUsersBranchColumn(() => ensureInventoryAndTransactionTables(next))
      })
    })
  })
}

function ensureInventoryAndTransactionTables(next) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS inventory (
      id INT AUTO_INCREMENT PRIMARY KEY,
      branch_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 0,
      low_stock_threshold INT NOT NULL DEFAULT 10,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_branch_product (branch_id, product_id),
      CONSTRAINT fk_inventory_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
      CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products(id)
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_movements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      branch_id INT NOT NULL,
      product_id INT NOT NULL,
      movement_type ENUM('stock_in', 'stock_out', 'sale') NOT NULL,
      quantity INT NOT NULL,
      reference_number VARCHAR(100) NULL,
      notes TEXT NULL,
      performed_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_movement_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
      CONSTRAINT fk_movement_product FOREIGN KEY (product_id) REFERENCES products(id),
      CONSTRAINT fk_movement_user FOREIGN KEY (performed_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS merchandising_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_number VARCHAR(100) NOT NULL UNIQUE,
      branch_id INT NOT NULL,
      performed_by INT NOT NULL,
      total_amount DECIMAL(12,2) NOT NULL,
      status ENUM('completed', 'voided') NOT NULL DEFAULT 'completed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_transaction_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
      CONSTRAINT fk_transaction_user FOREIGN KEY (performed_by) REFERENCES users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS merchandising_transaction_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transaction_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL,
      unit_price DECIMAL(12,2) NOT NULL,
      subtotal DECIMAL(12,2) NOT NULL,
      CONSTRAINT fk_transaction_item_header FOREIGN KEY (transaction_id) REFERENCES merchandising_transactions(id),
      CONSTRAINT fk_transaction_item_product FOREIGN KEY (product_id) REFERENCES products(id)
    )`,
  ]

  let index = 0
  function runNext() {
    if (index === statements.length) return next()
    db.query(statements[index], (error) => {
      if (error) {
        console.error('Error ensuring Week 3/4 tables:', error.message)
        process.exit(1)
      }
      index += 1
      runNext()
    })
  }
  runNext()
}

function ensureSuperAdmin() {
  const superAdminName = process.env.SUPER_ADMIN_NAME || 'ZWMPC CEO'
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD

  if (!superAdminEmail || !superAdminPassword) {
    console.warn('Default CEO/Super Admin was not created because env values are incomplete.')
    return
  }

  db.query('SELECT id, role FROM users WHERE email = ? LIMIT 1', [superAdminEmail], (selectError, users) => {
    if (selectError) {
      console.error('Error checking default CEO/Super Admin:', selectError.message)
      return
    }

    if (users.length > 0) {
      if (users[0].role !== 'super_admin') {
        db.query(
          'UPDATE users SET full_name = ?, role = ?, branch_id = NULL WHERE id = ?',
          [superAdminName, 'super_admin', users[0].id],
          (updateError) => {
            if (updateError) {
              console.error('Error updating default CEO/Super Admin role:', updateError.message)
              return
            }

            console.log('Default CEO/Super Admin account already existed and role was verified.')
          },
        )
      } else {
        console.log('Default CEO/Super Admin account already exists.')
      }

      return
    }

    bcrypt.hash(superAdminPassword, 10, (hashError, hashedPassword) => {
      if (hashError) {
        console.error('Error hashing default CEO/Super Admin password:', hashError.message)
        return
      }

      db.query(
        'INSERT INTO users (full_name, email, password, role, branch_id) VALUES (?, ?, ?, ?, NULL)',
        [superAdminName, superAdminEmail, hashedPassword, 'super_admin'],
        (insertError) => {
          if (insertError) {
            console.error('Error creating default CEO/Super Admin:', insertError.message)
            return
          }

          console.log('Default CEO/Super Admin account created.')
        },
      )
    })
  })
}

function validateBranchInput(data) {
  const branchName = data.branch_name ? data.branch_name.trim() : ''
  const branchCode = data.branch_code ? data.branch_code.trim().toUpperCase() : ''
  const location = data.location ? data.location.trim() : ''
  const status = data.status || 'active'

  if (!branchName || !branchCode || !location) {
    return { error: 'Branch name, branch code, and location are required.' }
  }

  if (!validStatuses.includes(status)) {
    return { error: 'Status must be active or inactive.' }
  }

  return { branchName, branchCode, location, status }
}

function validateProductInput(data) {
  const name = data.name ? data.name.trim() : ''
  const category = data.category ? data.category.trim() : ''
  const description = data.description ? data.description.trim() : ''
  const image = data.image ? data.image.trim() : null
  const status = data.status || 'active'
  const price = Number(data.price)
  const quantity = Number(data.quantity)

  if (!name || !category) {
    return { error: 'Product name and category are required.' }
  }

  if (!Number.isFinite(price) || price < 0) {
    return { error: 'Price must be a valid non-negative number.' }
  }

  if (!Number.isInteger(quantity) || quantity < 0) {
    return { error: 'Quantity must be a valid non-negative whole number.' }
  }

  if (!validStatuses.includes(status)) {
    return { error: 'Status must be active or inactive.' }
  }

  return { name, category, price, quantity, description, image, status }
}

app.get('/', (req, res) => {
  res.json({ message: 'ZWMPC authentication and Week 2 API is running.' })
})

app.post('/api/register', (req, res) => {
  const { full_name, email, password } = req.body
  const cleanedName = full_name ? full_name.trim() : ''
  const cleanedEmail = email ? email.trim().toLowerCase() : ''

  if (!cleanedName || !cleanedEmail || !password) {
    return res.status(400).json({ message: 'Full name, email, and password are required.' })
  }

  if (!isValidEmail(cleanedEmail)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' })
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long.' })
  }

  db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [cleanedEmail], (selectError, users) => {
    if (selectError) {
      return res.status(500).json({ message: 'Database error while checking email.' })
    }

    if (users.length > 0) {
      return res.status(409).json({ message: 'Email is already registered.' })
    }

    bcrypt.hash(password, 10, (hashError, hashedPassword) => {
      if (hashError) {
        return res.status(500).json({ message: 'Error securing password.' })
      }

      db.query(
        'INSERT INTO users (full_name, email, password, role, branch_id) VALUES (?, ?, ?, ?, NULL)',
        [cleanedName, cleanedEmail, hashedPassword, 'branch_staff'],
        (insertError) => {
          if (insertError) {
            return res.status(500).json({ message: 'Database error while creating account.' })
          }

          return res.status(201).json({
            message: 'Registration successful. Your account was created as Branch Staff.',
          })
        },
      )
    })
  })
})

app.post('/api/login', (req, res) => {
  const { email, password } = req.body
  const cleanedEmail = email ? email.trim().toLowerCase() : ''

  if (!cleanedEmail || !password) {
    return res.status(400).json({ message: 'Email and password are required.' })
  }

  const sql = `
    SELECT users.id, users.full_name, users.email, users.password, users.role, users.branch_id, branches.branch_name
    FROM users
    LEFT JOIN branches ON users.branch_id = branches.id
    WHERE users.email = ?
    LIMIT 1
  `

  db.query(sql, [cleanedEmail], (selectError, users) => {
    if (selectError) {
      return res.status(500).json({ message: 'Database error while logging in.' })
    }

    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' })
    }

    const user = users[0]

    bcrypt.compare(password, user.password, (compareError, isMatch) => {
      if (compareError) {
        return res.status(500).json({ message: 'Error validating password.' })
      }

      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid email or password.' })
      }

      const safeUser = buildSafeUser(user)
      const token = signToken(safeUser)

      return res.json({
        message: 'Login successful.',
        token,
        user: safeUser,
      })
    })
  })
})

app.get('/api/profile', authenticateToken, (req, res) => {
  res.json({
    message: 'Authenticated successfully.',
    user: buildSafeUser(req.user),
  })
})

app.get('/api/users', authenticateToken, authorizeRoles('super_admin'), (req, res) => {
  const sql = `
    SELECT users.id, users.full_name, users.email, users.role, users.branch_id, branches.branch_name, users.created_at
    FROM users
    LEFT JOIN branches ON users.branch_id = branches.id
    ORDER BY users.created_at DESC
  `

  db.query(sql, (error, users) => {
    if (error) {
      return res.status(500).json({ message: 'Database error while loading users.' })
    }

    return res.json({ users })
  })
})

app.post('/api/users', authenticateToken, authorizeRoles('super_admin'), (req, res) => {
  const { full_name, email, password, role, branch_id } = req.body
  const cleanedName = full_name ? full_name.trim() : ''
  const cleanedEmail = email ? email.trim().toLowerCase() : ''

  if (!cleanedName || !cleanedEmail || !password || !role) {
    return res.status(400).json({ message: 'Full name, email, password, and role are required.' })
  }

  if (!isValidEmail(cleanedEmail)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' })
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long.' })
  }

  if (!allowedUserRoles.includes(role)) {
    return res.status(400).json({ message: 'Role must be Admin / HR or Branch Staff.' })
  }

  const cleanedBranchId = role === 'branch_staff' ? branch_id : null

  if (role === 'branch_staff' && !isPositiveInteger(cleanedBranchId)) {
    return res.status(400).json({ message: 'Branch Staff accounts must be assigned to a branch.' })
  }

  db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [cleanedEmail], (selectError, existingUsers) => {
    if (selectError) {
      return res.status(500).json({ message: 'Database error while checking email.' })
    }

    if (existingUsers.length > 0) {
      return res.status(409).json({ message: 'Email is already registered.' })
    }

    function createUser() {
      bcrypt.hash(password, 10, (hashError, hashedPassword) => {
        if (hashError) {
          return res.status(500).json({ message: 'Error securing password.' })
        }

        db.query(
          'INSERT INTO users (full_name, email, password, role, branch_id) VALUES (?, ?, ?, ?, ?)',
          [cleanedName, cleanedEmail, hashedPassword, role, cleanedBranchId],
          (insertError, result) => {
            if (insertError) {
              return res.status(500).json({ message: 'Database error while creating user.' })
            }

            return res.status(201).json({
              message: 'User account created successfully.',
              user: {
                id: result.insertId,
                full_name: cleanedName,
                email: cleanedEmail,
                role,
                branch_id: cleanedBranchId,
              },
            })
          },
        )
      })
    }

    if (role === 'branch_staff') {
      db.query('SELECT id FROM branches WHERE id = ? LIMIT 1', [cleanedBranchId], (branchError, branches) => {
        if (branchError) {
          return res.status(500).json({ message: 'Database error while checking branch.' })
        }

        if (branches.length === 0) {
          return res.status(400).json({ message: 'Selected branch does not exist.' })
        }

        createUser()
      })
      return
    }

    createUser()
  })
})

app.get('/api/branches', authenticateToken, authorizeRoles('super_admin', 'admin_hr'), (req, res) => {
  const { search, status } = req.query
  const filters = []
  const params = []

  if (search) {
    filters.push('(branch_name LIKE ? OR branch_code LIKE ? OR location LIKE ?)')
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }

  if (status && validStatuses.includes(status)) {
    filters.push('status = ?')
    params.push(status)
  }

  const sql = `
    SELECT id, branch_name, branch_code, location, status, created_at
    FROM branches
    ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
    ORDER BY branch_name ASC
  `

  db.query(sql, params, (error, branches) => {
    if (error) {
      return res.status(500).json({ message: 'Database error while loading branches.' })
    }

    return res.json({ branches })
  })
})

app.post('/api/branches', authenticateToken, authorizeRoles('super_admin', 'admin_hr'), (req, res) => {
  const branch = validateBranchInput(req.body)

  if (branch.error) {
    return res.status(400).json({ message: branch.error })
  }

  db.query('SELECT id FROM branches WHERE branch_code = ? LIMIT 1', [branch.branchCode], (selectError, branches) => {
    if (selectError) {
      return res.status(500).json({ message: 'Database error while checking branch code.' })
    }

    if (branches.length > 0) {
      return res.status(409).json({ message: 'Branch code already exists.' })
    }

    db.query(
      'INSERT INTO branches (branch_name, branch_code, location, status) VALUES (?, ?, ?, ?)',
      [branch.branchName, branch.branchCode, branch.location, branch.status],
      (insertError, result) => {
        if (insertError) {
          return res.status(500).json({ message: 'Database error while creating branch.' })
        }

        return res.status(201).json({
          message: 'Branch created successfully.',
          branch: {
            id: result.insertId,
            branch_name: branch.branchName,
            branch_code: branch.branchCode,
            location: branch.location,
            status: branch.status,
          },
        })
      },
    )
  })
})

app.put('/api/branches/:id', authenticateToken, authorizeRoles('super_admin', 'admin_hr'), (req, res) => {
  const { id } = req.params
  const branch = validateBranchInput(req.body)

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: 'Invalid branch ID.' })
  }

  if (branch.error) {
    return res.status(400).json({ message: branch.error })
  }

  db.query('SELECT id FROM branches WHERE id = ? LIMIT 1', [id], (findError, foundBranches) => {
    if (findError) {
      return res.status(500).json({ message: 'Database error while checking branch.' })
    }

    if (foundBranches.length === 0) {
      return res.status(404).json({ message: 'Branch not found.' })
    }

    db.query(
      'SELECT id FROM branches WHERE branch_code = ? AND id <> ? LIMIT 1',
      [branch.branchCode, id],
      (duplicateError, duplicateBranches) => {
        if (duplicateError) {
          return res.status(500).json({ message: 'Database error while checking branch code.' })
        }

        if (duplicateBranches.length > 0) {
          return res.status(409).json({ message: 'Branch code already exists.' })
        }

        db.query(
          'UPDATE branches SET branch_name = ?, branch_code = ?, location = ?, status = ? WHERE id = ?',
          [branch.branchName, branch.branchCode, branch.location, branch.status, id],
          (updateError) => {
            if (updateError) {
              return res.status(500).json({ message: 'Database error while updating branch.' })
            }

            return res.json({ message: 'Branch updated successfully.' })
          },
        )
      },
    )
  })
})

app.patch('/api/branches/:id/status', authenticateToken, authorizeRoles('super_admin', 'admin_hr'), (req, res) => {
  const { id } = req.params
  const { status } = req.body

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: 'Invalid branch ID.' })
  }

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Status must be active or inactive.' })
  }

  db.query('UPDATE branches SET status = ? WHERE id = ?', [status, id], (error, result) => {
    if (error) {
      return res.status(500).json({ message: 'Database error while updating branch status.' })
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Branch not found.' })
    }

    return res.json({ message: 'Branch status updated successfully.' })
  })
})

app.get('/api/products', authenticateToken, authorizeRoles('super_admin', 'admin_hr', 'branch_staff'), (req, res) => {
  const { search, category, status } = req.query
  const filters = []
  const params = []

  if (search) {
    filters.push('(name LIKE ? OR category LIKE ?)')
    params.push(`%${search}%`, `%${search}%`)
  }

  if (category) {
    filters.push('category = ?')
    params.push(category)
  }

  if (status && validStatuses.includes(status)) {
    filters.push('status = ?')
    params.push(status)
  }

  const sql = `
    SELECT id, name, category, price, quantity, description, status, image, created_at
    FROM products
    ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
    ORDER BY created_at DESC
  `

  db.query(sql, params, (error, products) => {
    if (error) {
      return res.status(500).json({ message: 'Database error while loading products.' })
    }

    return res.json({ products })
  })
})

app.post('/api/products', authenticateToken, authorizeRoles('super_admin', 'admin_hr'), (req, res) => {
  const product = validateProductInput(req.body)

  if (product.error) {
    return res.status(400).json({ message: product.error })
  }

  db.query(
    'INSERT INTO products (name, category, price, quantity, description, status, image) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [product.name, product.category, product.price, product.quantity, product.description, product.status, product.image],
    (error, result) => {
      if (error) {
        return res.status(500).json({ message: 'Database error while creating product.' })
      }

      return res.status(201).json({
        message: 'Product created successfully.',
        product: {
          id: result.insertId,
          ...product,
        },
      })
    },
  )
})

app.put('/api/products/:id', authenticateToken, authorizeRoles('super_admin', 'admin_hr'), (req, res) => {
  const { id } = req.params
  const product = validateProductInput(req.body)

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: 'Invalid product ID.' })
  }

  if (product.error) {
    return res.status(400).json({ message: product.error })
  }

  db.query(
    'UPDATE products SET name = ?, category = ?, price = ?, quantity = ?, description = ?, status = ?, image = ? WHERE id = ?',
    [product.name, product.category, product.price, product.quantity, product.description, product.status, product.image, id],
    (error, result) => {
      if (error) {
        return res.status(500).json({ message: 'Database error while updating product.' })
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Product not found.' })
      }

      return res.json({ message: 'Product updated successfully.' })
    },
  )
})

app.patch('/api/products/:id/status', authenticateToken, authorizeRoles('super_admin', 'admin_hr'), (req, res) => {
  const { id } = req.params
  const { status } = req.body

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: 'Invalid product ID.' })
  }

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Status must be active or inactive.' })
  }

  db.query('UPDATE products SET status = ? WHERE id = ?', [status, id], (error, result) => {
    if (error) {
      return res.status(500).json({ message: 'Database error while updating product status.' })
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Product not found.' })
    }

    return res.json({ message: 'Product status updated successfully.' })
  })
})

app.get('/api/inventory', authenticateToken, authorizeRoles('super_admin', 'admin_hr', 'branch_staff'), (req, res) => {
  const { search, category, status } = req.query
  const branchId = getAuthorizedBranchId(req, req.query.branch_id)
  if (branchId?.error) return res.status(403).json({ message: branchId.error })

  const filters = []
  const params = []
  if (branchId) {
    filters.push('i.branch_id = ?')
    params.push(branchId)
  }
  if (search) {
    filters.push('p.name LIKE ?')
    params.push(`%${search}%`)
  }
  if (category) {
    filters.push('p.category = ?')
    params.push(category)
  }
  if (status === 'in_stock') filters.push('i.quantity > i.low_stock_threshold')
  if (status === 'low_stock') filters.push('i.quantity > 0 AND i.quantity <= i.low_stock_threshold')
  if (status === 'out_of_stock') filters.push('i.quantity = 0')

  const sql = `
    SELECT i.id, i.branch_id, b.branch_name, b.branch_code, i.product_id, p.name AS product_name,
      p.category, p.price, i.quantity, i.low_stock_threshold, i.updated_at,
      CASE WHEN i.quantity = 0 THEN 'out_of_stock'
           WHEN i.quantity <= i.low_stock_threshold THEN 'low_stock'
           ELSE 'in_stock' END AS stock_status
    FROM inventory i
    INNER JOIN branches b ON b.id = i.branch_id
    INNER JOIN products p ON p.id = i.product_id
    ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
    ORDER BY b.branch_name, p.name
  `
  db.query(sql, params, (error, inventory) => {
    if (error) return res.status(500).json({ message: 'Database error while loading inventory.' })
    res.json({ inventory })
  })
})

app.get('/api/inventory/:id', authenticateToken, authorizeRoles('super_admin', 'admin_hr', 'branch_staff'), (req, res, next) => {
  if (!isPositiveInteger(req.params.id)) return next()
  const sql = `SELECT i.*, b.branch_name, p.name AS product_name, p.category, p.price
    FROM inventory i INNER JOIN branches b ON b.id = i.branch_id
    INNER JOIN products p ON p.id = i.product_id WHERE i.id = ? LIMIT 1`
  db.query(sql, [req.params.id], (error, records) => {
    if (error) return res.status(500).json({ message: 'Database error while loading inventory.' })
    if (!records.length) return res.status(404).json({ message: 'Inventory record not found.' })
    if (req.user.role === 'branch_staff' && Number(records[0].branch_id) !== Number(req.user.branch_id)) {
      return res.status(403).json({ message: 'You can access your assigned branch only.' })
    }
    res.json({ inventory: records[0] })
  })
})

app.patch('/api/inventory/:id/threshold', authenticateToken, authorizeRoles('super_admin', 'admin_hr', 'branch_staff'), (req, res) => {
  if (!isPositiveInteger(req.params.id) || !isNonNegativeInteger(req.body.low_stock_threshold)) {
    return res.status(400).json({ message: 'Inventory ID and a non-negative low-stock threshold are required.' })
  }
  db.query('SELECT branch_id FROM inventory WHERE id = ? LIMIT 1', [req.params.id], (findError, records) => {
    if (findError) return res.status(500).json({ message: 'Database error while loading inventory.' })
    if (!records.length) return res.status(404).json({ message: 'Inventory record not found.' })
    if (req.user.role === 'branch_staff' && Number(records[0].branch_id) !== Number(req.user.branch_id)) {
      return res.status(403).json({ message: 'You can update your assigned branch only.' })
    }
    db.query('UPDATE inventory SET low_stock_threshold = ? WHERE id = ?', [Number(req.body.low_stock_threshold), req.params.id], (error) => {
      if (error) return res.status(500).json({ message: 'Database error while updating threshold.' })
      res.json({ message: 'Low-stock threshold updated successfully.' })
    })
  })
})

function processStockMovement(type) {
  return (req, res) => {
    const { branch_id, product_id, quantity, reference_number, notes } = req.body
    const authorizedBranchId = getAuthorizedBranchId(req, branch_id)
    if (authorizedBranchId?.error) return res.status(403).json({ message: authorizedBranchId.error })
    if (!isPositiveInteger(authorizedBranchId) || !isPositiveInteger(product_id) || !isPositiveInteger(quantity)) {
      return res.status(400).json({ message: 'An active branch, product, and positive whole-number quantity are required.' })
    }

    db.getConnection((connectionError, connection) => {
      if (connectionError) return res.status(500).json({ message: 'Database connection error.' })
      connection.beginTransaction((beginError) => {
        if (beginError) {
          connection.release()
          return res.status(500).json({ message: 'Could not start stock operation.' })
        }
        getActiveBranch(connection, authorizedBranchId, (branchError, branch) => {
          if (branchError) return rollbackAndRespond(connection, res, 500, 'Database error while checking branch.')
          if (!branch) return rollbackAndRespond(connection, res, 404, 'Branch not found.')
          if (branch.inactive) return rollbackAndRespond(connection, res, 400, 'Inactive branches cannot receive stock operations.')
          connection.query('SELECT id, name, status FROM products WHERE id = ? LIMIT 1', [product_id], (productError, products) => {
            if (productError) return rollbackAndRespond(connection, res, 500, 'Database error while checking product.')
            if (!products.length) return rollbackAndRespond(connection, res, 404, 'Product not found.')
            if (products[0].status !== 'active') return rollbackAndRespond(connection, res, 400, 'Inactive products cannot be used for stock operations.')
            const insertInventory = 'INSERT INTO inventory (branch_id, product_id, quantity) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE id = id'
            connection.query(insertInventory, [authorizedBranchId, product_id], (insertError) => {
              if (insertError) return rollbackAndRespond(connection, res, 500, 'Database error while preparing inventory.')
              connection.query('SELECT id, quantity FROM inventory WHERE branch_id = ? AND product_id = ? FOR UPDATE', [authorizedBranchId, product_id], (inventoryError, records) => {
                if (inventoryError) return rollbackAndRespond(connection, res, 500, 'Database error while locking inventory.')
                const inventory = records[0]
                if (type === 'stock_out' && Number(inventory.quantity) < Number(quantity)) {
                  return rollbackAndRespond(connection, res, 400, 'Insufficient stock for this stock-out operation.')
                }
                const change = type === 'stock_in' ? Number(quantity) : -Number(quantity)
                connection.query('UPDATE inventory SET quantity = quantity + ? WHERE id = ?', [change, inventory.id], (updateError) => {
                  if (updateError) return rollbackAndRespond(connection, res, 500, 'Database error while updating inventory.')
                  connection.query(
                    'INSERT INTO inventory_movements (branch_id, product_id, movement_type, quantity, reference_number, notes, performed_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [authorizedBranchId, product_id, type, Number(quantity), reference_number?.trim() || null, notes?.trim() || null, req.user.id],
                    (movementError) => {
                      if (movementError) return rollbackAndRespond(connection, res, 500, 'Database error while recording stock movement.')
                      connection.commit((commitError) => {
                        if (commitError) return rollbackAndRespond(connection, res, 500, 'Could not complete stock operation.')
                        connection.release()
                        res.json({ message: type === 'stock_in' ? 'Stock received successfully.' : 'Stock released successfully.', quantity: Number(inventory.quantity) + change })
                      })
                    },
                  )
                })
              })
            })
          })
        })
      })
    })
  }
}

app.post('/api/inventory/stock-in', authenticateToken, authorizeRoles('super_admin', 'admin_hr', 'branch_staff'), processStockMovement('stock_in'))
app.post('/api/inventory/stock-out', authenticateToken, authorizeRoles('super_admin', 'admin_hr', 'branch_staff'), processStockMovement('stock_out'))

app.get('/api/inventory/movements', authenticateToken, authorizeRoles('super_admin', 'admin_hr', 'branch_staff'), (req, res) => {
  const branchId = getAuthorizedBranchId(req, req.query.branch_id)
  if (branchId?.error) return res.status(403).json({ message: branchId.error })
  const filters = []
  const params = []
  if (branchId) { filters.push('m.branch_id = ?'); params.push(branchId) }
  if (isPositiveInteger(req.query.product_id)) { filters.push('m.product_id = ?'); params.push(req.query.product_id) }
  if (['stock_in', 'stock_out', 'sale'].includes(req.query.movement_type)) { filters.push('m.movement_type = ?'); params.push(req.query.movement_type) }
  if (req.query.date_from) { filters.push('DATE(m.created_at) >= ?'); params.push(req.query.date_from) }
  if (req.query.date_to) { filters.push('DATE(m.created_at) <= ?'); params.push(req.query.date_to) }
  const sql = `SELECT m.*, b.branch_name, p.name AS product_name, u.full_name AS performed_by_name
    FROM inventory_movements m INNER JOIN branches b ON b.id = m.branch_id
    INNER JOIN products p ON p.id = m.product_id INNER JOIN users u ON u.id = m.performed_by
    ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY m.created_at DESC LIMIT 200`
  db.query(sql, params, (error, movements) => {
    if (error) return res.status(500).json({ message: 'Database error while loading movement history.' })
    res.json({ movements })
  })
})

app.get('/api/transactions', authenticateToken, authorizeRoles('super_admin', 'admin_hr', 'branch_staff'), (req, res) => {
  const branchId = getAuthorizedBranchId(req, req.query.branch_id)
  if (branchId?.error) return res.status(403).json({ message: branchId.error })
  const filters = []
  const params = []
  if (branchId) { filters.push('t.branch_id = ?'); params.push(branchId) }
  if (req.query.search) { filters.push('t.transaction_number LIKE ?'); params.push(`%${req.query.search}%`) }
  if (['completed', 'voided'].includes(req.query.status)) { filters.push('t.status = ?'); params.push(req.query.status) }
  if (req.query.date_from) { filters.push('DATE(t.created_at) >= ?'); params.push(req.query.date_from) }
  if (req.query.date_to) { filters.push('DATE(t.created_at) <= ?'); params.push(req.query.date_to) }
  const sql = `SELECT t.*, b.branch_name, u.full_name AS performed_by_name, COUNT(ti.id) AS item_count
    FROM merchandising_transactions t INNER JOIN branches b ON b.id = t.branch_id
    INNER JOIN users u ON u.id = t.performed_by LEFT JOIN merchandising_transaction_items ti ON ti.transaction_id = t.id
    ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
    GROUP BY t.id ORDER BY t.created_at DESC LIMIT 200`
  db.query(sql, params, (error, transactions) => {
    if (error) return res.status(500).json({ message: 'Database error while loading transactions.' })
    res.json({ transactions })
  })
})

app.get('/api/transactions/:id', authenticateToken, authorizeRoles('super_admin', 'admin_hr', 'branch_staff'), (req, res) => {
  if (!isPositiveInteger(req.params.id)) return res.status(400).json({ message: 'Invalid transaction ID.' })
  const headerSql = `SELECT t.*, b.branch_name, b.branch_code, u.full_name AS performed_by_name
    FROM merchandising_transactions t INNER JOIN branches b ON b.id = t.branch_id INNER JOIN users u ON u.id = t.performed_by
    WHERE t.id = ? LIMIT 1`
  db.query(headerSql, [req.params.id], (error, records) => {
    if (error) return res.status(500).json({ message: 'Database error while loading transaction.' })
    if (!records.length) return res.status(404).json({ message: 'Transaction not found.' })
    const transaction = records[0]
    if (req.user.role === 'branch_staff' && Number(transaction.branch_id) !== Number(req.user.branch_id)) return res.status(403).json({ message: 'You can access your assigned branch only.' })
    db.query(`SELECT ti.*, p.name AS product_name, p.category FROM merchandising_transaction_items ti INNER JOIN products p ON p.id = ti.product_id WHERE ti.transaction_id = ?`, [transaction.id], (itemsError, items) => {
      if (itemsError) return res.status(500).json({ message: 'Database error while loading transaction items.' })
      res.json({ transaction: { ...transaction, items } })
    })
  })
})

app.post('/api/transactions', authenticateToken, authorizeRoles('super_admin', 'admin_hr', 'branch_staff'), (req, res) => {
  const branchId = getAuthorizedBranchId(req, req.body.branch_id)
  if (branchId?.error) return res.status(403).json({ message: branchId.error })
  if (!isPositiveInteger(branchId) || !Array.isArray(req.body.items) || req.body.items.length === 0) return res.status(400).json({ message: 'A branch and at least one transaction item are required.' })
  const quantities = new Map()
  for (const item of req.body.items) {
    if (!isPositiveInteger(item.product_id) || !isPositiveInteger(item.quantity)) return res.status(400).json({ message: 'Every item needs a product and positive whole-number quantity.' })
    quantities.set(Number(item.product_id), (quantities.get(Number(item.product_id)) || 0) + Number(item.quantity))
  }
  const items = [...quantities.entries()].map(([product_id, quantity]) => ({ product_id, quantity })).sort((a, b) => a.product_id - b.product_id)

  db.getConnection((connectionError, connection) => {
    if (connectionError) return res.status(500).json({ message: 'Database connection error.' })
    connection.beginTransaction((beginError) => {
      if (beginError) { connection.release(); return res.status(500).json({ message: 'Could not start transaction.' }) }
      getActiveBranch(connection, branchId, (branchError, branch) => {
        if (branchError) return rollbackAndRespond(connection, res, 500, 'Database error while checking branch.')
        if (!branch) return rollbackAndRespond(connection, res, 404, 'Branch not found.')
        if (branch.inactive) return rollbackAndRespond(connection, res, 400, 'Inactive branches cannot create transactions.')
        const processed = []
        function processItem(index) {
          if (index === items.length) return saveTransaction()
          const item = items[index]
          connection.query('SELECT id, name, price, status FROM products WHERE id = ? LIMIT 1', [item.product_id], (productError, products) => {
            if (productError) return rollbackAndRespond(connection, res, 500, 'Database error while checking product.')
            if (!products.length) return rollbackAndRespond(connection, res, 404, 'A selected product was not found.')
            if (products[0].status !== 'active') return rollbackAndRespond(connection, res, 400, `${products[0].name} is inactive and cannot be sold.`)
            connection.query('SELECT id, quantity FROM inventory WHERE branch_id = ? AND product_id = ? FOR UPDATE', [branchId, item.product_id], (inventoryError, inventoryRows) => {
              if (inventoryError) return rollbackAndRespond(connection, res, 500, 'Database error while checking inventory.')
              if (!inventoryRows.length) return rollbackAndRespond(connection, res, 400, `${products[0].name} has no inventory record at this branch.`)
              if (Number(inventoryRows[0].quantity) < item.quantity) return rollbackAndRespond(connection, res, 400, `Insufficient stock for ${products[0].name}.`)
              const unitPriceCents = Math.round(Number(products[0].price) * 100)
              processed.push({
                ...item,
                inventory_id: inventoryRows[0].id,
                product_name: products[0].name,
                unit_price_cents: unitPriceCents,
                subtotal_cents: unitPriceCents * item.quantity,
              })
              processItem(index + 1)
            })
          })
        }
        function saveTransaction() {
          const totalCents = processed.reduce((sum, item) => sum + item.subtotal_cents, 0)
          const total = totalCents / 100
          const transactionNumber = `TXN-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`
          connection.query('INSERT INTO merchandising_transactions (transaction_number, branch_id, performed_by, total_amount, status) VALUES (?, ?, ?, ?, ?)', [transactionNumber, branchId, req.user.id, total.toFixed(2), 'completed'], (headerError, headerResult) => {
            if (headerError) return rollbackAndRespond(connection, res, 500, 'Database error while saving transaction.')
            function saveItem(index) {
              if (index === processed.length) return finish()
              const item = processed[index]
              connection.query('INSERT INTO merchandising_transaction_items (transaction_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)', [headerResult.insertId, item.product_id, item.quantity, (item.unit_price_cents / 100).toFixed(2), (item.subtotal_cents / 100).toFixed(2)], (itemError) => {
                if (itemError) return rollbackAndRespond(connection, res, 500, 'Database error while saving transaction items.')
                connection.query('UPDATE inventory SET quantity = quantity - ? WHERE id = ? AND quantity >= ?', [item.quantity, item.inventory_id, item.quantity], (stockError, stockResult) => {
                  if (stockError || stockResult.affectedRows !== 1) return rollbackAndRespond(connection, res, 400, `Insufficient stock for ${item.product_name}.`)
                  connection.query('INSERT INTO inventory_movements (branch_id, product_id, movement_type, quantity, reference_number, performed_by) VALUES (?, ?, ?, ?, ?, ?)', [branchId, item.product_id, 'sale', item.quantity, transactionNumber, req.user.id], (movementError) => {
                    if (movementError) return rollbackAndRespond(connection, res, 500, 'Database error while recording sale movement.')
                    saveItem(index + 1)
                  })
                })
              })
            }
            function finish() {
              connection.commit((commitError) => {
                if (commitError) return rollbackAndRespond(connection, res, 500, 'Could not complete transaction.')
                connection.release()
                const responseItems = processed.map((item) => ({
                  product_id: item.product_id,
                  product_name: item.product_name,
                  quantity: item.quantity,
                  unit_price: (item.unit_price_cents / 100).toFixed(2),
                  subtotal: (item.subtotal_cents / 100).toFixed(2),
                }))
                res.status(201).json({ message: 'Transaction completed successfully.', transaction: { id: headerResult.insertId, transaction_number: transactionNumber, branch, items: responseItems, total_amount: total.toFixed(2), status: 'completed', created_at: new Date().toISOString() } })
              })
            }
            saveItem(0)
          })
        }
        processItem(0)
      })
    })
  })
})

app.get('/api/dashboard/summary', authenticateToken, authorizeRoles('super_admin', 'admin_hr', 'branch_staff'), (req, res) => {
  const scopedBranchId = req.user.role === 'branch_staff' ? getAuthorizedBranchId(req, req.user.branch_id) : null
  if (scopedBranchId?.error) return res.status(403).json({ message: scopedBranchId.error })
  const inventoryWhere = scopedBranchId ? 'WHERE branch_id = ?' : ''
  const inventoryParams = scopedBranchId ? [scopedBranchId] : []
  const transactionWhere = scopedBranchId ? 'AND branch_id = ?' : ''
  const transactionParams = scopedBranchId ? [scopedBranchId] : []
  db.query('SELECT COUNT(*) AS total_branches, SUM(status = \'active\') AS active_branches FROM branches', (branchError, branchRows) => {
    if (branchError) return res.status(500).json({ message: 'Database error while loading dashboard.' })
    db.query('SELECT COUNT(*) AS total_active_products FROM products WHERE status = \'active\'', (productError, productRows) => {
      if (productError) return res.status(500).json({ message: 'Database error while loading dashboard.' })
      db.query(`SELECT COALESCE(SUM(quantity), 0) AS total_inventory_units, SUM(quantity > low_stock_threshold) AS in_stock_items, SUM(quantity > 0 AND quantity <= low_stock_threshold) AS low_stock_items, SUM(quantity = 0) AS out_of_stock_items FROM inventory ${inventoryWhere}`, inventoryParams, (inventoryError, inventoryRows) => {
        if (inventoryError) return res.status(500).json({ message: 'Database error while loading dashboard.' })
        db.query(`SELECT COUNT(*) AS transactions_today, COALESCE(SUM(total_amount), 0) AS sales_today FROM merchandising_transactions WHERE status = 'completed' AND DATE(created_at) = CURDATE() ${transactionWhere}`, transactionParams, (transactionError, transactionRows) => {
          if (transactionError) return res.status(500).json({ message: 'Database error while loading dashboard.' })
          res.json({ summary: { ...branchRows[0], ...productRows[0], ...inventoryRows[0], ...transactionRows[0], scoped_branch_id: scopedBranchId || null } })
        })
      })
    })
  })
})

app.get('/api/dashboard/branches', authenticateToken, authorizeRoles('super_admin', 'admin_hr', 'branch_staff'), (req, res) => {
  const scopedBranchId = req.user.role === 'branch_staff' ? getAuthorizedBranchId(req, req.user.branch_id) : null
  if (scopedBranchId?.error) return res.status(403).json({ message: scopedBranchId.error })
  const sql = `SELECT b.id, b.branch_name, b.branch_code, b.status, COUNT(i.id) AS inventory_records,
    COALESCE(SUM(i.quantity), 0) AS total_units, SUM(i.quantity > 0 AND i.quantity <= i.low_stock_threshold) AS low_stock_count, SUM(i.quantity = 0) AS out_of_stock_count,
    MAX(i.updated_at) AS latest_inventory_activity
    FROM branches b LEFT JOIN inventory i ON i.branch_id = b.id ${scopedBranchId ? 'WHERE b.id = ?' : ''}
    GROUP BY b.id ORDER BY b.branch_name`
  db.query(sql, scopedBranchId ? [scopedBranchId] : [], (error, branches) => {
    if (error) return res.status(500).json({ message: 'Database error while loading branch dashboard.' })
    res.json({ branches })
  })
})

app.get('/api/dashboard/activity', authenticateToken, authorizeRoles('super_admin', 'admin_hr', 'branch_staff'), (req, res) => {
  const branchId = req.user.role === 'branch_staff' ? getAuthorizedBranchId(req, req.user.branch_id) : null
  if (branchId?.error) return res.status(403).json({ message: branchId.error })
  const movementSql = `SELECT m.id, m.created_at, m.movement_type, m.quantity, m.reference_number, b.branch_name, p.name AS product_name, u.full_name AS performed_by_name
    FROM inventory_movements m INNER JOIN branches b ON b.id = m.branch_id INNER JOIN products p ON p.id = m.product_id INNER JOIN users u ON u.id = m.performed_by
    ${branchId ? 'WHERE m.branch_id = ?' : ''} ORDER BY m.created_at DESC LIMIT 10`
  db.query(movementSql, branchId ? [branchId] : [], (movementError, movements) => {
    if (movementError) return res.status(500).json({ message: 'Database error while loading recent activity.' })
    const transactionSql = `SELECT t.id, t.transaction_number, t.total_amount, t.created_at, b.branch_name, u.full_name AS performed_by_name
      FROM merchandising_transactions t INNER JOIN branches b ON b.id = t.branch_id INNER JOIN users u ON u.id = t.performed_by
      WHERE t.status = 'completed' ${branchId ? 'AND t.branch_id = ?' : ''} ORDER BY t.created_at DESC LIMIT 10`
    db.query(transactionSql, branchId ? [branchId] : [], (transactionError, transactions) => {
      if (transactionError) return res.status(500).json({ message: 'Database error while loading recent activity.' })
      res.json({ movements, transactions })
    })
  })
})

app.get('/api/admin-test', authenticateToken, authorizeRoles('super_admin', 'admin_hr'), (req, res) => {
  res.json({
    message: 'Admin/HR test endpoint authorized.',
    user: buildSafeUser(req.user),
  })
})

app.get('/api/super-admin-test', authenticateToken, authorizeRoles('super_admin'), (req, res) => {
  res.json({
    message: 'Super Admin test endpoint authorized.',
    user: buildSafeUser(req.user),
  })
})

app.get('/api/staff-test', authenticateToken, authorizeRoles('super_admin', 'admin_hr', 'branch_staff'), (req, res) => {
  res.json({
    message: 'Staff test endpoint authorized.',
    user: buildSafeUser(req.user),
  })
})

db.getConnection((error, connection) => {
  if (error) {
    console.error('Database connection failed:', error.message || error.code || error)
    process.exit(1)
  }

  connection.release()

  console.log(`Connected to MySQL database: ${process.env.DB_NAME}`)

  ensureDatabaseFoundation(() => {
    ensureSuperAdmin()

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`)
    })
  })
})
