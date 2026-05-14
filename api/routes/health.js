/**
 * Health checks para Kubernetes
 * - /health/live: el proceso responde (siempre 200 si Express vive)
 * - /health/ready: dependencias respondiendo (Mongo + Redis)
 * - /health/startup: inicializacion completada
 */
const express = require('express');
const mongoose = require('mongoose');
const redis = require('../services/redis');

const router = express.Router();

router.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

router.get('/ready', async (req, res) => {
  const checks = {
    mongo: false,
    redis: false,
  };

  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      checks.mongo = true;
    }
  } catch (e) {
    checks.mongo = false;
  }

  try {
    const pong = await redis.ping();
    checks.redis = pong === 'PONG';
  } catch (e) {
    checks.redis = false;
  }

  const ready = checks.mongo && checks.redis;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks });
});

router.get('/startup', (req, res) => {
  if (mongoose.connection.readyState === 1) {
    res.status(200).json({ status: 'started' });
  } else {
    res.status(503).json({ status: 'starting' });
  }
});

module.exports = router;
