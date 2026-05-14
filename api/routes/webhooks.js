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
const { verifyHmacSignature, verifyZuyuSignature, isTimestampValid } = require('../utils/hmac');
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
//
// Contrato (ZUYU/backend/publicApi):
//   Header  X-Zuyu-Signature: t=<unix>,v1=<hmac>[,v0=<previo>]
//   Header  X-Zuyu-Event-Id:  <uuid>  (idempotencia)
//   Body    { eventId, eventType, negocioSlug, data }
//   eventTypes: producto_creado | producto_actualizado | producto_eliminado
//               | stock_actualizado | pedido_confirmado
//
// Seguridad: HMAC estilo Stripe + dual-secret (rotacion) + replay protection.
// ═══════════════════════════════════════════════════════════════════
router.post(
  '/zuyu',
  webhookLimiter,
  express.raw({ type: 'application/json', limit: '50kb' }),
  async (req, res, next) => {
    try {
      const secret = process.env.ZUYU_WEBHOOK_SECRET;
      const secretPrevio = process.env.ZUYU_WEBHOOK_SECRET_PREVIO || null;

      const rawBody = req.body.toString('utf8');
      const signatureHeader = req.headers['x-zuyu-signature'];
      const eventIdHeader = req.headers['x-zuyu-event-id'];

      if (secret) {
        const secrets = [secret, secretPrevio].filter(Boolean);
        if (!verifyZuyuSignature(rawBody, signatureHeader, secrets)) {
          throw new WebhookSignatureError('Firma de webhook ZUYU invalida o expirada');
        }
      } else {
        logger.warn('ZUYU_WEBHOOK_SECRET no configurado — webhook NO verificado (solo dev)');
      }

      const payload = JSON.parse(rawBody);
      const { eventId, eventType, negocioSlug, data } = payload;

      if (!eventType || !negocioSlug) {
        return res
          .status(400)
          .json({ error: 'INVALID_PAYLOAD', message: 'eventType y negocioSlug requeridos' });
      }

      // eventId del body o del header — jobId para idempotencia.
      // BullMQ rechaza dos jobs con el mismo jobId => evento duplicado se
      // procesa una sola vez.
      const idemId = eventId || eventIdHeader || `${negocioSlug}:${eventType}:${Date.now()}`;

      logger.info({ eventType, negocioSlug, eventId: idemId }, 'Webhook ZUYU recibido');

      await colaZuyu.add(
        'sync',
        {
          event: eventType,
          negocioSlug,
          payload: data,
          eventId: idemId,
          receivedAt: Date.now(),
        },
        {
          jobId: idemId,
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        }
      );

      res.status(200).json({ ok: true, eventId: idemId });
    } catch (e) {
      next(e);
    }
  }
);

module.exports = router;
