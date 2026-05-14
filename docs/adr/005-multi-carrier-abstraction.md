# ADR-005: Capa de abstraccion multi-carrier para delivery

**Fecha:** 13 de mayo de 2026
**Estado:** Aceptado

## Contexto

El sistema necesita solicitar repartidores externos para entregar pedidos. En Mexico
existen 3 carriers DaaS (Delivery as a Service) viables:

- **Uber Direct**: 68 ciudades, sandbox real, OAuth2
- **Lalamove**: CDMX/ZMVM, sandbox auto-servicio, HMAC-SHA256
- **iVoy**: CDMX/GDL/MTY, credenciales sandbox publicas

Cada uno tiene API distinto, schema distinto, autenticacion distinta.

## Decision

Implementar una **capa de abstraccion** en `services/delivery/` con interfaz comun:

```js
{
  requestDelivery(pedido) -> { deliveryId, trackingUrl, estado, costoEnvio }
  getStatus(deliveryId)   -> { estado }
  cancelDelivery(id)      -> { ok }
  verifyWebhook(body, headers) -> bool
  parseWebhook(body)      -> { deliveryId, estado, repartidor }
}
```

Cada carrier es un provider en `providers/`. El negocio configura su carrier
preferido en `negocio.deliveryProvider`.

## Razones

1. **Bonus de la rubrica**: Daniel da +5 pts por "multi-carrier conmutando segun ciudad
   del negocio". La abstraccion lo hace trivial.

2. **Cambiar de carrier es 1 linea.** Si Uber sube precios, cambiar a Lalamove no
   requiere refactorizar la app.

3. **Mocks transparentes para tests.** Los tests usan MSW para interceptar HTTP
   sin diferencia de codigo.

4. **El profe acepta mocks.** Documento de aceptacion: "puede usarse el sandbox o
   una respuesta simulada con el mismo contrato de la API. Lo que se evalua es la
   arquitectura."

## Implementacion

- iVoy: usa sandbox real (credenciales publicas, sin onboarding)
- Lalamove: mock por defecto (LALAMOVE_MOCK=true)
- Uber Direct: mock por defecto (UBER_MOCK=true)

Para el bonus +5 en defensa, podemos cambiar `IVOY_MOCK=false` y mostrar respuesta
real del sandbox iVoy. Lalamove y Uber requieren onboarding empresarial que no es
viable en 23 dias.

## Consecuencias

- 3 archivos en providers/ con misma firma
- Tests con MSW para cada provider
- Webhook unico /webhooks/delivery?provider=X
- Worker decide provider segun el campo `negocio.deliveryProvider`
