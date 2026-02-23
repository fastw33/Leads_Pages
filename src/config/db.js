import mongoose from 'mongoose'

function maskMongoUri(uri = '') {
  return uri.replace(/\/\/([^:/]+):([^@]+)@/g, '//***:***@')
}

function buildMongoUri() {
  const {
    MONGODB_URI,
    MONGO_URI,
    MONGO_USER,
    MONGO_PASS,
    AUTH_SOURCE,
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASS,
    DB_NAME,
    MONGODB_DB_NAME,
  } = process.env

  const dbName = DB_NAME || MONGODB_DB_NAME || ''
  const authSource = AUTH_SOURCE || dbName || 'admin'

  // A) URI completa (prioridad)
  if (MONGODB_URI) return MONGODB_URI

  // B) Si hay MONGO_URI, puede ser:
  //  - completa (con user/pass y /db) -> no tocar
  //  - base (solo host/puerto) -> inyectar user/pass y db si existen
  if (MONGO_URI) {
    const base = MONGO_URI.replace(/\/+$/, '')

    // Si ya trae "/algo" después del host, asumimos que ya incluye db y/o query
    // Ej: mongodb://host:27017/leads?authSource=admin
    const hasDbPath = new URL(base).pathname && new URL(base).pathname !== '/'

    if (hasDbPath) return base

    const dbPath = dbName ? `/${dbName}` : ''
    const query = authSource
      ? `?authSource=${encodeURIComponent(authSource)}`
      : ''

    // Credenciales desde MONGO_USER/MONGO_PASS (tu caso)
    if (MONGO_USER && MONGO_PASS) {
      const user = encodeURIComponent(MONGO_USER)
      const pass = encodeURIComponent(MONGO_PASS)
      const hostPart = base.replace(/^mongodb:\/\//, '')
      return `mongodb://${user}:${pass}@${hostPart}${dbPath}${query}`
    }

    // Si no hay credenciales, devuelve base + db
    return `${base}${dbPath}`
  }

  // C) Construcción manual (si no hay MONGO_URI ni MONGODB_URI)
  const host = DB_HOST || '127.0.0.1'
  const port = DB_PORT || '27017'
  const dbPath = dbName ? `/${dbName}` : ''

  // Credenciales: primero DB_USER/DB_PASS, si no, fallback a MONGO_USER/MONGO_PASS
  const userRaw = DB_USER || MONGO_USER
  const passRaw = DB_PASS || MONGO_PASS

  if (userRaw && passRaw) {
    const user = encodeURIComponent(userRaw)
    const pass = encodeURIComponent(passRaw)
    const query = authSource
      ? `?authSource=${encodeURIComponent(authSource)}`
      : ''
    return `mongodb://${user}:${pass}@${host}:${port}${dbPath}${query}`
  }

  return `mongodb://${host}:${port}${dbPath}`
}

export async function connectDB() {
  const uri = buildMongoUri()

  mongoose.set('strictQuery', true)

  if (mongoose.connection.listeners('connected').length === 0) {
    mongoose.connection.on('connected', () =>
      console.log('✅ MongoDB conectado exitosamente')
    )
    mongoose.connection.on('error', err =>
      console.error('❌ Error MongoDB:', err.message)
    )
    mongoose.connection.on('disconnected', () =>
      console.log('⚠️  MongoDB desconectado')
    )
  }

  try {
    // Debug seguro (si lo necesitas)
    console.log('Intentando conectar a:', maskMongoUri(uri))

    await mongoose.connect(uri)
  } catch (error) {
    console.error('❌ Fallo crítico en la conexión:', error.message)
    process.exit(1)
  }
}
