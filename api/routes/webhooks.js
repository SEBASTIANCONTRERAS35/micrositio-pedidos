/**
 * Webhooks de carriers (delivery)
 * Endpoint unico que despacha por provider
 */
const express = require('express');
const { Queue } = require('bullmq');
const delivery = require('../services/delivery');
const { webhookLimiter } = require('../middlewares/rateLimit');
const { WebhookSignatureError } = require('../utils/errors');
const logger = require('../utils/logger');

const router = express.Router();

const colaWebhooks = new Queue('webhook-delivery', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
});

// POST /webhooks/delivery
// Body raw es necesario para verificar HMAC. Lo capturamos antes del json parser
router.post(
  '/delivery',
  webhookLimiter,
  express.raw({ type: 'application/json', limit: '100kb' }),
  async (req, res, next) => {
    try {
      const provider = req.query.provider || req.headers['x-provider'];
      if (!provider) throw new WebhookSignatureError('Provider no especificado');

      const rawBody = req.body.toString('utf8');

      // Verificar firma
      const valid = delivery.verifyWebhook(provider, rawBody, req.headers);
      if (!valid) throw new WebhookSignatureError();

      const parsed = JSON.parse(rawBody);
      const event = delivery.parseWebhook(provider, parsed);

      // Idempotencia: por deliveryId + estado evitamos procesar dos veces
      // (el job en el worker hara el manejo final)
      logger.info({ provider, deliveryId: event.deliveryId, estado: event.estado }, 'Webhook recibido');

      await colaWebhooks.add(
        'process-webhook',
        { provider, event, receivedAt: Date.now() },
        {
          // jobId garantiza idempotencia: BullMQ no acepta dos jobs con mismo id
          jobId: `${event.deliveryId}-${event.estado}`,
          removeOnComplete: 100,
          removeOnFail: 50,
        }
      );

      res.status(200).json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
