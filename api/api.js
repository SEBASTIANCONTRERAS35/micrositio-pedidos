require('dotenv').config();
const express = require('express');
const path = require('path');
const compression = require('compression');
const cors = require('cors');
const hpp = require('hpp');
const mongoSanitize = require('./middlewares/mongoSanitize');
const pinoHttp = require('pino-http');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

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
app.use(
  pinoHttp({
    logger,
    // ID de request: reutiliza x-request-id si el cliente/proxy lo envia,
    // si no genera un uuid. Permite correlacion end-to-end (HTTP -> jobs).
    genReqId: (req, res) => {
      const incoming = req.headers['x-request-id'];
      const requestId =
        incoming && String(incoming).trim() ? String(incoming).trim() : randomUUID();
      // Expone el requestId en la respuesta para que el cliente lo correlacione.
      res.setHeader('x-request-id', requestId);
      return requestId;
    },
    // Campos comunes en cada log de request (sin PII ni secretos).
    customProps: (req) => ({
      ip: req.ip,
      usuarioId: req.user?.id,
      negocioId: req.user?.negocioId,
    }),
    // Mapea el status a nivel: 5xx error, 4xx warn, resto info.
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) {
        return 'error';
      }
      if (res.statusCode >= 400) {
        return 'warn';
      }
      return 'info';
    },
  })
);
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

// Handlers del ciclo de vida de la conexion a MongoDB (caidas en caliente).
// El 'connected' inicial lo cubre start(); estos cubren cambios posteriores.
mongoose.connection.on('disconnected', () => {
  logger.error({ event: 'infra.mongo.desconectado' }, 'Conexion a MongoDB perdida');
});
mongoose.connection.on('reconnected', () => {
  logger.info({ event: 'infra.mongo.reconectado' }, 'Conexion a MongoDB restablecida');
});
mongoose.connection.on('error', (err) => {
  logger.error({ event: 'infra.mongo.error', err }, 'Error en la conexion a MongoDB');
});

let httpServer = null;

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
    logger.info({ event: 'infra.mongo.conectado' }, 'Conexion a MongoDB establecida');

    const PORT = parseInt(process.env.PORT || '3000', 10);
    httpServer = app.listen(PORT, '0.0.0.0', () => {
      logger.info(
        { event: 'infra.boot', port: PORT, nodeEnv: process.env.NODE_ENV || 'development' },
        `API escuchando en el puerto ${PORT}`
      );
    });
  } catch (err) {
    logger.error({ event: 'infra.boot', err }, 'No se pudo iniciar la API');
    process.exit(1);
  }
}

let cerrando = false;

// Cierra ordenadamente el servidor HTTP y mongoose ante una senal del sistema.
async function shutdown(signal) {
  if (cerrando) {
    return;
  }
  cerrando = true;
  logger.info({ event: 'infra.shutdown', signal }, `Apagando la API (senal ${signal})`);
  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await mongoose.disconnect();
    logger.info({ event: 'infra.shutdown', signal }, 'API apagada limpiamente');
  } catch (e) {
    logger.error({ event: 'infra.shutdown', err: e }, 'Error durante el apagado de la API');
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Excepciones no controladas: log fatal/error y salida para que el orquestador
// reinicie el pod en un estado limpio (no seguir en un estado corrupto).
process.on('uncaughtException', (err) => {
  logger.fatal({ event: 'infra.uncaught', err }, 'Excepcion no capturada en la API');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ event: 'infra.uncaught', err }, 'Promesa rechazada sin manejar en la API');
  process.exit(1);
});

if (require.main === module) {
  start();
}

module.exports = app;
