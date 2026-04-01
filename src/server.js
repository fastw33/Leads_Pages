import 'dotenv/config'
import { connectDB } from './config/db.js'
import { createApp } from './app.js'

const PORT = Number(process.env.PORT) || 4500
const ALLOW =
  String(process.env.ALLOW_START_WITHOUT_DB || '').toLowerCase() === 'true'

;(async () => {
  try {
    await connectDB() // como ALLOW_START_WITHOUT_DB=false, si falla DB debe fallar todo

    const app = createApp()

    // Para Coolify/Traefik
    app.set('trust proxy', 1)

    // IMPORTANTE: escuchar en 0.0.0.0
    app.listen(PORT, '0.0.0.0', () =>
      console.log(`🚀 Server en http://0.0.0.0:${PORT}`)
    )
  } catch (err) {
    console.error('❌ Error al iniciar el servidor:', err.message)
    process.exit(1)
  }
})()
