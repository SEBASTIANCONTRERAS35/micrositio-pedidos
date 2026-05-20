/**
 * Job: notificaciones
 * Envia email (Resend) y WhatsApp (Twilio Sandbox) al cliente
 *
 * Tipos:
 *  - confirmacion-cliente: pedido recibido
 *  - repartidor-asignado: tu pedido va en camino
 *  - entregado: confirmacion de entrega
 */
const mongoose = require('mongoose');
const { Resend } = require('resend');
const twilio = require('twilio');

const pedidoSchema = new mongoose.Schema({}, { strict: false, collection: 'pedidos' });
const Pedido = mongoose.models.Pedido || mongoose.model('Pedido', pedidoSchema);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const twilioClient = process.env.TWILIO_ACCOUNT_SID
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

module.exports = async (job, logger) => {
  const { pedidoId } = job.data;
  const pedido = await Pedido.findOne({ pedidoId }).lean();
  if (!pedido) {
    throw new Error(`Pedido ${pedidoId} no encontrado`);
  }

  const subject = subjectFor(job.name, pedido);
  const html = htmlFor(job.name, pedido);
  const sms = smsFor(job.name, pedido);

  await Promise.allSettled([
    sendEmail(pedido, subject, html, logger),
    sendWhatsApp(pedido, sms, logger),
  ]);

  return { ok: true };
};

async function sendEmail(pedido, subject, html, logger) {
  if (!resend || !pedido.cliente?.email) {
    logger.warn(
      { pedidoId: pedido.pedidoId },
      'Email no enviado (Resend no configurado o sin email)'
    );
    return;
  }
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'pedidos@zuyu.local',
      to: pedido.cliente.email,
      subject,
      html,
    });
    logger.info({ pedidoId: pedido.pedidoId }, 'Email enviado');
  } catch (e) {
    logger.error({ err: e, pedidoId: pedido.pedidoId }, 'Error al enviar email');
  }
}

async function sendWhatsApp(pedido, message, logger) {
  if (!twilioClient || !pedido.cliente?.telefono) {
    logger.warn({ pedidoId: pedido.pedidoId }, 'WhatsApp no enviado (Twilio no configurado)');
    return;
  }
  try {
    await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${pedido.cliente.telefono}`,
      body: message,
    });
    logger.info({ pedidoId: pedido.pedidoId }, 'WhatsApp enviado');
  } catch (e) {
    logger.error({ err: e, pedidoId: pedido.pedidoId }, 'Error al enviar WhatsApp');
  }
}

function subjectFor(jobName, pedido) {
  const map = {
    'confirmacion-cliente': `Pedido recibido — ${pedido.pedidoId}`,
    'repartidor-asignado': `Tu pedido va en camino — ${pedido.pedidoId}`,
    entregado: `Pedido entregado — ${pedido.pedidoId}`,
  };
  return map[jobName] || `Actualizacion de tu pedido ${pedido.pedidoId}`;
}

function htmlFor(jobName, pedido) {
  const base = `
    <h2>${subjectFor(jobName, pedido)}</h2>
    <p>Hola ${pedido.cliente.nombre},</p>
  `;
  const cuerpo = {
    'confirmacion-cliente': `<p>Hemos recibido tu pedido por <strong>$${pedido.total.toFixed(2)}</strong>. Te avisaremos cuando este confirmado.</p>`,
    'repartidor-asignado': `<p>Tu pedido va en camino.${pedido.delivery?.trackingUrl ? ` <a href="${pedido.delivery.trackingUrl}">Rastrear</a>` : ''}</p>`,
    entregado: `<p>Tu pedido fue entregado. Gracias por tu compra!</p>`,
  };
  return base + (cuerpo[jobName] || '');
}

function smsFor(jobName, pedido) {
  const map = {
    'confirmacion-cliente': `Hola ${pedido.cliente.nombre}, tu pedido ${pedido.pedidoId} fue recibido. Total: $${pedido.total.toFixed(2)}.`,
    'repartidor-asignado': `Tu pedido ${pedido.pedidoId} va en camino.${pedido.delivery?.trackingUrl ? ` Rastrear: ${pedido.delivery.trackingUrl}` : ''}`,
    entregado: `Pedido ${pedido.pedidoId} entregado. Gracias!`,
  };
  return map[jobName] || `Actualizacion de tu pedido ${pedido.pedidoId}`;
}
