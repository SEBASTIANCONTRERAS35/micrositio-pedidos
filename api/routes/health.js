const express = require('express');
const mongoose = require('mongoose');
const redis = require('../services/redis');

const router = express.Router();

// Liveness: responde 200 si el proceso Express esta vivo.
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

// Readiness: verifica que Mongo y Redis respondan antes de marcar listo.
router.get('/ready', async (req, res) => {
  const chequeos = {
    mongo: false,
    redis: false,
  };

  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      chequeos.mongo = true;
    }
  } catch (e) {
    chequeos.mongo = false;
  }

  try {
    const respuestaPing = await redis.ping();
    chequeos.redis = respuestaPing === 'PONG';
  } catch (e) {
    chequeos.redis = false;
  }

  const listo = chequeos.mongo && chequeos.redis;
  res.status(listo ? 200 : 503).json({ status: listo ? 'ready' : 'not_ready', checks: chequeos });
});

// Startup: indica si la inicializacion (conexion Mongo) ya completo.
router.get('/startup', (req, res) => {
  if (mongoose.connection.readyState === 1) {
    res.status(200).json({ status: 'started' });
  } else {
    res.status(503).json({ status: 'starting' });
  }
});

module.exports = router;
