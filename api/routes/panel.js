/**
 * Panel del dueno del negocio (vistas + endpoints JSON)
 */
const express = require('express');
const { z } = require('zod');
const Pedido = require('../models/pedido');
const Negocio = require('../models/negocio');
const Usuario = require('../models/usuario');
const requireAuth = require('../middlewares/auth');
const { validate } = require('../middlewares/validation');
const { encryptSecret } = require('../utils/crypto');
const { assertSafeUrl } = require('../utils/urlGuard');

const router = express.Router();

// Validacion del body de PUT /api/integracion. apiKey/webhookSecret son
// opcionales (vacio = "no cambiar"); baseUrl la valida a fondo el guard SSRF.
const IntegracionSchema = z.object({
  baseUrl: z.string().trim().max(300).optional(),
  apiKey: z.string().trim().min(8).max(300).optional(),
  webhookSecret: z.string().trim().min(8).max(300).optional(),
  conectado: z.boolean().optional(),
});

// Vistas EJS
router.get('/login', (req, res) => res.render('panel/login'));

router.get('/pedidos', async (req, res) => {
  // Renderea la vista, los datos se cargan via JS con el JWT del localStorage
  // Pero necesitamos saber el negocio para el header — usar middleware optional
  // Por ahora pasamos un negocio vacio si no hay JWT
  res.render('panel/pedidos', {
    negocio: { nombre: 'Mi Negocio' },
    usuario: { email: '' },
  });
});

router.get('/integracion', (req, res) => {
  res.render('panel/integracion', {
    negocio: { nombre: 'Mi Negocio' },
    usuario: { email: '' },
  });
});

// ── Integracion con ZUYU ─────────────────────────────────────────
// Estado de la integracion. NUNCA devuelve apiKey/webhookSecret en claro —
// solo el prefijo visible y banderas de "configurado".
router.get('/api/integracion', requireAuth, async (req, res, next) => {
  try {
    const negocio = await Negocio.findById(req.user.negocioId)
      .select('+zuyuConfig.apiKey +zuyuConfig.webhookSecret')
      .lean();
    if (!negocio) {
      return res.status(404).json({ message: 'Negocio no encontrado' });
    }
    const z = negocio.zuyuConfig || {};
    res.json({
      conectado: z.conectado === true,
      baseUrl: z.baseUrl || '',
      apiKeyConfigurada: !!z.apiKey,
      apiKeyPrefix: z.apiKeyPrefix || null,
      webhookSecretConfigurado: !!z.webhookSecret,
      actualizadoEn: z.actualizadoEn || null,
    });
  } catch (e) {
    next(e);
  }
});

// Guarda la config de ZUYU. apiKey/webhookSecret solo se actualizan si vienen
// con valor (vacio = "no cambiar") — asi el usuario puede editar la baseUrl o
// el toggle sin re-capturar el secreto. Los secretos se cifran at-rest.
router.put('/api/integracion', requireAuth, validate(IntegracionSchema), async (req, res, next) => {
  try {
    const { baseUrl, apiKey, webhookSecret, conectado } = req.body || {};

    const negocio = await Negocio.findById(req.user.negocioId).select(
      '+zuyuConfig.apiKey +zuyuConfig.webhookSecret +zuyuConfig.webhookSecretPrevio'
    );
    if (!negocio) {
      return res.status(404).json({ message: 'Negocio no encontrado' });
    }
    if (!negocio.zuyuConfig) {
      negocio.zuyuConfig = {};
    }
    const zc = negocio.zuyuConfig;

    if (baseUrl !== undefined && baseUrl !== '') {
      // Guard SSRF: solo https, sin IPs privadas/loopback/metadata cloud.
      try {
        await assertSafeUrl(baseUrl);
      } catch (e) {
        return res.status(400).json({ message: `URL de ZUYU rechazada: ${e.message}` });
      }
      zc.baseUrl = baseUrl.trim();
    }

    if (apiKey) {
      const key = String(apiKey).trim();
      zc.apiKey = encryptSecret(key); // cifrado at-rest (AES-256-GCM)
      zc.apiKeyPrefix = key.slice(0, 12); // prefijo en claro — no es secreto
    }

    if (webhookSecret) {
      // Rotacion dual-secret: el secret actual (ya cifrado) pasa a "previo".
      if (zc.webhookSecret) {
        zc.webhookSecretPrevio = zc.webhookSecret;
      }
      zc.webhookSecret = encryptSecret(String(webhookSecret).trim());
    }

    if (conectado === true) {
      if (!zc.apiKey) {
        return res.status(400).json({
          message: 'Configura el API key antes de conectar con ZUYU',
        });
      }
      zc.conectado = true;
    } else if (conectado === false) {
      zc.conectado = false;
    }

    zc.actualizadoEn = new Date();
    negocio.markModified('zuyuConfig');
    await negocio.save();

    res.json({
      ok: true,
      conectado: zc.conectado === true,
      baseUrl: zc.baseUrl || '',
      apiKeyConfigurada: !!zc.apiKey,
      apiKeyPrefix: zc.apiKeyPrefix || null,
      webhookSecretConfigurado: !!zc.webhookSecret,
      actualizadoEn: zc.actualizadoEn,
    });
  } catch (e) {
    next(e);
  }
});

// API JSON (autenticada)
router.get('/api/pedidos', requireAuth, async (req, res, next) => {
  try {
    const pedidos = await Pedido.find({ negocioId: req.user.negocioId })
      .sort({ creadoEn: -1 })
      .limit(100)
      .lean();
    res.json(pedidos);
  } catch (e) {
    next(e);
  }
});

router.get('/api/me', requireAuth, async (req, res, next) => {
  try {
    const [usuario, negocio] = await Promise.all([
      Usuario.findById(req.user.id).lean(),
      Negocio.findById(req.user.negocioId).lean(),
    ]);
    res.json({ usuario, negocio });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
