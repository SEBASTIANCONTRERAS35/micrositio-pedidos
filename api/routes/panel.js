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

const IntegracionSchema = z.object({
  baseUrl: z.string().trim().max(300).optional(),
  apiKey: z.string().trim().min(8).max(300).optional(),
  webhookSecret: z.string().trim().min(8).max(300).optional(),
  conectado: z.boolean().optional(),
});

// Renderiza la vista de login del panel
router.get('/login', (req, res) => res.render('panel/login'));

// Renderiza la vista de pedidos del panel
router.get('/pedidos', (req, res) => res.render('panel/pedidos'));

// Renderiza la vista de integracion del panel
router.get('/integracion', (req, res) => res.render('panel/integracion'));

// Devuelve el estado de la integracion sin exponer secretos en claro
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

// Guarda la config de ZUYU cifrando secretos solo si vienen con valor
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
      try {
        await assertSafeUrl(baseUrl);
      } catch (e) {
        return res.status(400).json({ message: `URL de ZUYU rechazada: ${e.message}` });
      }
      zc.baseUrl = baseUrl.trim();
    }

    if (apiKey) {
      const clave = String(apiKey).trim();
      zc.apiKey = encryptSecret(clave);
      zc.apiKeyPrefix = clave.slice(0, 12);
    }

    if (webhookSecret) {
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

// Lista los ultimos 100 pedidos del negocio autenticado
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

// Devuelve el usuario y negocio del solicitante autenticado
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
