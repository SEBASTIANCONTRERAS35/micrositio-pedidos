# ADR-004: Sealed Secrets en vez de HashiCorp Vault

**Fecha:** 13 de mayo de 2026
**Estado:** Aceptado

## Decision

Usamos **Bitnami Sealed Secrets** para gestion de secretos.

## Razones

1. **Simplicidad operativa.** Sealed Secrets es un controller K8s que descifra
   automaticamente. Vault requiere arquitectura aparte, sidecar injection, lease
   renewal, etc.

2. **Permite committear secrets cifrados al repo publico.** Esto es clave porque el
   repo se vuelve publico el 4 de junio.

3. **Cero infraestructura adicional.** Solo el controller (1 pod) y el binario
   `kubeseal` en local.

4. **Para el alcance del proyecto, no se necesita rotacion automatica ni dynamic
   secrets.** Los passwords se generan una vez al inicio y se mantienen estaticos.

## Lo que sacrificamos

- Sin auditoria de quien accede a un secret (Vault si tiene)
- Sin rotacion automatica
- Sin secrets dinamicos (DB credentials con TTL)

Estos features serian valiosos en produccion real de ZUYU. Pero overkill para 23 dias
de proyecto universitario.

## Alternativas consideradas

- **HashiCorp Vault**: complejo, 1 semana de setup
- **External Secrets Operator + AWS Secrets Manager**: requiere cuenta cloud
- **SOPS**: requiere PGP/age keys distribuidas a todos los devs
