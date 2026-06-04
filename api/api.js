require('dotenv').config();
const express = require('express');
const path = require('path');
const compression = require('compression');
const cors = require('cors');
const hpp = require('hpp');
const mongoSanitize = require('./middlewares/mongoSanitize');
const pinoHttp = require('pino-http');
const mongoose = require('mongoose');

const helmetMw = require('./middlewares/helmet');
const errorHandler = require('./middlewares/errorHandler');
const metricsMw = require('./middlewares/metrics');
const logger = require('./utils/logger');

const healthRoutes = require('./routes/health');
const tiendaRoutes = require('./routes/tienda');
const pedidosRoutes = require('./routes/pedidos');
const authRoutes = require('./routes/auth');
const panelRoutes = require('./routes/panel');
const webhooksRoutes = require('./routes/webhooks');

const app = express();

app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmetMw);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || false,
    credentials: false,
  })
);
app.use(compression());
app.use(pinoHttp({ logger }));
app.use(metricsMw.middleware);

app.use((req, res, next) => {
  if (req.path.startsWith('/webhooks/')) {
    return next();
  }
  express.json({ limit: '20kb' })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path.startsWith('/webhooks/')) {
    return next();
  }
  express.urlencoded({ extended: false, limit: '20kb' })(req, res, next);
});
app.use(mongoSanitize);
app.use(hpp());

const staticMaxAge = process.env.NODE_ENV === 'production' ? '1d' : 0;
app.use('/css', express.static(path.join(__dirname, 'public/css'), { maxAge: staticMaxAge }));
app.use('/js', express.static(path.join(__dirname, 'public/js'), { maxAge: staticMaxAge }));

app.get('/metrics', metricsMw.handler);

app.use('/health', healthRoutes);
app.use('/tienda', tiendaRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/auth', authRoutes);
app.use('/panel', panelRoutes);
app.use('/api/panel', panelRoutes);
app.use('/webhooks', webhooksRoutes);

app.get('/', (req, res) => res.redirect('/health/live'));

app.use((req, res) => res.status(404).render('tienda/404', { mensaje: 'Pagina no encontrada' }));

app.use(errorHandler);

// Conecta a MongoDB y arranca el servidor HTTP
async function start() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI no definido');
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });
    logger.info('MongoDB conectado');

    const PORT = parseInt(process.env.PORT || '3000', 10);
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`API escuchando en puerto ${PORT}`);
    });
  } catch (err) {
    logger.error({ err }, 'Error al iniciar el servidor');
    process.exit(1);
  }
}

// Cierra mongoose y termina el proceso ante una senal
async function shutdown(signal) {
  logger.info({ signal }, 'Cerrando servidor...');
  try {
    await mongoose.disconnect();
  } catch (e) {
    logger.error({ err: e }, 'Error cerrando mongoose');
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});

if (require.main === module) {
  start();
}

module.exports = app;
