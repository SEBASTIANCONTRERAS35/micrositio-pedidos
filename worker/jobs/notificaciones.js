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

  await sendEmail(pedido, subject, html, job.name, logger);

  return { ok: true };
};

// Envia el email del pedido via Resend si esta configurado.
async function sendEmail(pedido, subject, html, jobName, logger) {
  // Demo-safe: si Resend NO esta configurado (o el pedido no trae email) se omite
  // el envio y se continua OK; NO se lanza para no provocar reintentos/DLQ por un
  // proveedor que no esta dado de alta.
  if (!resend) {
    logger.warn(
      {
        event: 'notif.email.omitido',
        pedidoId: pedido.pedidoId,
        tipo: jobName,
        motivo: 'no_config',
      },
      'Email omitido: Resend no esta configurado'
    );
    return;
  }
  if (!pedido.cliente?.email) {
    logger.warn(
      {
        event: 'notif.email.omitido',
        pedidoId: pedido.pedidoId,
        tipo: jobName,
        motivo: 'sin_email',
      },
      'Email omitido: el pedido no tiene email de cliente'
    );
    return;
  }
  try {
    const respuesta = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'pedidos@zuyu.local',
      to: pedido.cliente.email,
      subject,
      html,
    });
    logger.info(
      {
        event: 'notif.email.enviado',
        pedidoId: pedido.pedidoId,
        tipo: jobName,
        messageId: respuesta?.data?.id,
      },
      'Email de notificacion enviado'
    );
  } catch (e) {
    // Fallo REAL de un Resend configurado: se loguea como error y se re-lanza para
    // que el wrapper emita job.fallo/job.dlq y el job reintente (attempts acotado).
    logger.error(
      { event: 'notif.email.error', err: e, pedidoId: pedido.pedidoId, tipo: jobName },
      'Error al enviar el email con Resend'
    );
    throw e;
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
