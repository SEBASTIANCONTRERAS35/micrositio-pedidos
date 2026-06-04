const express = require('express');
const { Queue } = require('bullmq');
const delivery = require('../services/delivery');
const zuyu = require('../services/zuyu');
const { webhookLimiter } = require('../middlewares/rateLimit');
const { WebhookSignatureError } = require('../utils/errors');
const { verifyZuyuSignature } = require('../utils/hmac');

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

router.post(
  '/delivery',
  webhookLimiter,
  express.raw({ type: 'application/json', limit: '100kb' }),
  // Verifica firma del carrier y encola el webhook de delivery con idempotencia
  async (req, res, next) => {
    try {
      const provider = req.query.provider || req.headers['x-provider'];
      if (!provider) {
        req.log.warn(
          { event: 'webhook.delivery.firma_invalida', ip: req.ip, motivo: 'provider_ausente' },
          'Webhook de delivery rechazado: provider no especificado'
        );
        throw new WebhookSignatureError('Provider no especificado');
      }

      const rawBody = req.body.toString('utf8');

      const valida = delivery.verifyWebhook(provider, rawBody, req.headers);
      if (!valida) {
        req.log.warn(
          {
            event: 'webhook.delivery.firma_invalida',
            provider,
            ip: req.ip,
            motivo: 'firma_invalida',
          },
          'Webhook de delivery rechazado: firma invalida'
        );
        throw new WebhookSignatureError();
      }

      const parseado = JSON.parse(rawBody);
      const event = delivery.parseWebhook(provider, parseado);

      const jobId = `${event.deliveryId}-${event.estado}`;

      req.log.info(
        {
          event: 'webhook.delivery.recibido',
          provider,
          deliveryId: event.deliveryId,
          estado: event.estado,
          jobId,
        },
        'Webhook de delivery recibido'
      );

      await colaWebhooks.add(
        'process-webhook',
        { provider, event, receivedAt: Date.now(), requestId: req.id },
        {
          jobId,
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

router.post(
  '/zuyu',
  webhookLimiter,
  express.raw({ type: 'application/json', limit: '50kb' }),
  // Verifica HMAC por negocio del evento ZUYU y lo encola para sincronizar inventario
  async (req, res, next) => {
    try {
      const rawBody = req.body.toString('utf8');
      const signatureHeader = req.headers['x-zuyu-signature'];
      const eventIdHeader = req.headers['x-zuyu-event-id'];

      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Body JSON invalido' });
      }
      const { eventId, eventType, negocioSlug, data } = payload;

      if (!eventType || !negocioSlug) {
        return res
          .status(400)
          .json({ error: 'INVALID_PAYLOAD', message: 'eventType y negocioSlug requeridos' });
      }

      const cfg = await zuyu.resolverConfig(negocioSlug);
      const secrets = [cfg.webhookSecret, cfg.webhookSecretPrevio].filter(Boolean);
      if (secrets.length === 0) {
        req.log.warn(
          { event: 'webhook.rechazado', negocioSlug, ip: req.ip, motivo: 'sin_webhook_secret' },
          'Webhook ZUYU rechazado: negocio sin webhook secret'
        );
        throw new WebhookSignatureError('Webhook secret no configurado para este negocio');
      }
      if (!verifyZuyuSignature(rawBody, signatureHeader, secrets)) {
        req.log.warn(
          {
            event: 'webhook.zuyu.firma_invalida',
            negocioSlug,
            eventType,
            ip: req.ip,
            motivo: 'firma_invalida',
          },
          'Webhook ZUYU rechazado: firma HMAC invalida o expirada'
        );
        throw new WebhookSignatureError('Firma de webhook ZUYU invalida o expirada');
      }

      const idemId = eventId || eventIdHeader || `${negocioSlug}:${eventType}:${Date.now()}`;

      req.log.info(
        { event: 'webhook.zuyu.recibido', eventType, negocioSlug, eventId: idemId, jobId: idemId },
        'Webhook ZUYU recibido'
      );

      await colaZuyu.add(
        'sync',
        {
          event: eventType,
          negocioSlug,
          payload: data,
          eventId: idemId,
          receivedAt: Date.now(),
          requestId: req.id,
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
