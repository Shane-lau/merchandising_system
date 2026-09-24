require('dotenv').config()

const express = require('express')
const cors = require('cors')
const mysql = require('mysql2')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const app = express()
const PORT = process.env.PORT || 5000
const JWT_SECRET = process.env.JWT_SECRET

app.use(cors())
app.use(express.json())

// Replace lines 15–20 in your server.js with this:
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false
  }
})

const allowedUserRoles = ['admin_hr', 'branch_staff']
const validStatuses = ['active', 'inactive']

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0
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
        ensureUsersBranchColumn(next)
      })
    })
  })
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

db.connect((error) => {
  if (error) {
    console.error('Database connection failed:', error.message || error.code || error)
    process.exit(1)
  }

  console.log(`Connected to MySQL database: ${process.env.DB_NAME}`)

  ensureDatabaseFoundation(() => {
    ensureSuperAdmin()

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`)
    })
  })
})
