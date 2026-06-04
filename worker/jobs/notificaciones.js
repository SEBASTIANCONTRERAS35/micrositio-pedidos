const mongoose = require('mongoose');
const { Resend } = require('resend');

const pedidoSchema = new mongoose.Schema({}, { strict: false, collection: 'pedidos' });
const Pedido = mongoose.models.Pedido || mongoose.model('Pedido', pedidoSchema);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Procesa el job y envia el email de notificacion al cliente del pedido.
module.exports = async (job, logger) => {
  const { pedidoId } = job.data;
  const pedido = await Pedido.findOne({ pedidoId }).lean();
  if (!pedido) {
    throw new Error(`Pedido ${pedidoId} no encontrado`);
  }

  const subject = subjectFor(job.name, pedido);
  const html = htmlFor(job.name, pedido);

  await sendEmail(pedido, subject, html, logger);

  return { ok: true };
};

// Envia el email del pedido via Resend si esta configurado.
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

// Devuelve el asunto del email segun el tipo de job.
function subjectFor(jobName, pedido) {
  const mapa = {
    'confirmacion-cliente': `Pedido recibido — ${pedido.pedidoId}`,
    'repartidor-asignado': `Tu pedido va en camino — ${pedido.pedidoId}`,
    entregado: `Pedido entregado — ${pedido.pedidoId}`,
  };
  return mapa[jobName] || `Actualizacion de tu pedido ${pedido.pedidoId}`;
}

// Construye el cuerpo HTML del email segun el tipo de job.
function htmlFor(jobName, pedido) {
  const base = `
    <h2>${subjectFor(jobName, pedido)}</h2>
    <p>Hola ${pedido.cliente.nombre},</p>
  `;
  const cuerpo = {
    'confirmacion-cliente': `<p>Hemos recibido tu pedido por <strong>$${pedido.total.toFixed(2)}</strong>. Te avisaremos cuando este confirmado.</p>`,
    'repartidor-asignado': `<p>Tu pedido va en camino.</p>`,
    entregado: `<p>Tu pedido fue entregado. Gracias por tu compra!</p>`,
  };
  return base + (cuerpo[jobName] || '');
}
