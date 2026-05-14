/**
 * Webhooks
 *  - /webhooks/delivery: actualizaciones de carriers (Uber, Lalamove, iVoy)
 *  - /webhooks/zuyu: cambios de inventario desde ZUYU (sincronizacion)
 */
const express = require('express');
const { Queue } = require('bullmq');
const delivery = require('../services/delivery');
const { webhookLimiter } = require('../middlewares/rateLimit');
const { WebhookSignatureError } = require('../utils/errors');
const { verifyHmacSignature, isTimestampValid } = require('../utils/hmac');
const logger = require('../utils/logger');

const router = express.Router();

const colaWebhooks = new Queue('webhook-delivery', {
  connection: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
});

const colaZuyu = new Queue('sync-zuyu', {
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
      if (!provider) {
        throw new WebhookSignatureError('Provider no especificado');
      }

      const rawBody = req.body.toString('utf8');

      // Verificar firma
      const valid = delivery.verifyWebhook(provider, rawBody, req.headers);
      if (!valid) {
        throw new WebhookSignatureError();
      }

      const parsed = JSON.parse(rawBody);
      const event = delivery.parseWebhook(provider, parsed);

      // Idempotencia: por deliveryId + estado evitamos procesar dos veces
      // (el job en el worker hara el manejo final)
      logger.info(
        { provider, deliveryId: event.deliveryId, estado: event.estado },
        'Webhook recibido'
      );

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

// ═══════════════════════════════════════════════════════════════════
// POST /webhooks/zuyu — eventos de inventario desde ZUYU
// HMAC verification con secret compartido + replay protection
// ═══════════════════════════════════════════════════════════════════
router.post(
  '/zuyu',
  webhookLimiter,
  express.raw({ type: 'application/json', limit: '50kb' }),
  async (req, res, next) => {
    try {
      const secret = process.env.ZUYU_WEBHOOK_SECRET;
      if (!secret) {
        logger.warn('ZUYU_WEBHOOK_SECRET no configurado — webhook NO verificado');
      }

      const rawBody = req.body.toString('utf8');
      const signature = req.headers['x-zuyu-signature'];
      const timestamp = req.headers['x-zuyu-timestamp'];

      if (secret) {
        if (!isTimestampValid(timestamp)) {
          throw new WebhookSignatureError('Timestamp expirado o invalido');
        }
        if (!verifyHmacSignature(`${timestamp}.${rawBody}`, signature, secret)) {
          throw new WebhookSignatureError();
        }
      }

      const payload = JSON.parse(rawBody);
      const { event, negocioSlug, data } = payload;

      if (!event || !negocioSlug) {
        return res
          .status(400)
          .json({ error: 'INVALID_PAYLOAD', message: 'event y negocioSlug requeridos' });
      }

      logger.info({ event, negocioSlug }, 'Webhook ZUYU recibido');

      // Idempotencia: jobId unico por evento+producto+timestamp
      const jobId = `${negocioSlug}:${event}:${data.productoId || 'none'}:${timestamp}`;

      await colaZuyu.add(
        'sync',
        { event, negocioSlug, payload: data, receivedAt: Date.now() },
        {
          jobId,
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        }
      );

      res.status(200).json({ ok: true, jobId });
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
