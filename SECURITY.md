# Política de Seguridad

## Reportar vulnerabilidades

Si encuentras una vulnerabilidad, contacta al autor directamente en lugar de abrir un issue público.

## Prácticas de seguridad implementadas

### Capa de aplicación
- Helmet con Content Security Policy estricto
- Rate limiting con backend Redis (rate-limiter-flexible)
- Validación de toda entrada con Zod
- Sanitización de inputs MongoDB (express-mongo-sanitize)
- HTTP Parameter Pollution prevention (hpp)
- Argon2 para hash de passwords (no bcrypt)
- JWT con RS256 + refresh token rotation
- PII redactada en todos los logs (Pino redact)
- HTTPS obligatorio (cert-manager + nginx-ingress)
- Webhook signature verification con HMAC-SHA256 + timingSafeEqual
- Replay attack prevention (timestamp window de 5 min)
- Idempotency-Key en endpoints POST críticos

### Capa de Kubernetes
- Pod Security Standards: Restricted enforced en namespace
- runAsNonRoot, readOnlyRootFilesystem en todos los pods
- capabilities.drop: [ALL]
- seccompProfile: RuntimeDefault
- ServiceAccounts dedicadas por aplicación
- NetworkPolicy default-deny + reglas explícitas
- Secrets cifrados con Sealed Secrets (no plaintext en repo)
- Imagen base distroless (sin shell, sin package manager)
- Trivy scan en cada build (falla si CVE crítico)

### Capa de datos
- MongoDB con SCRAM-SHA-256 authentication
- Replica Set con keyfile interno
- Usuarios separados por aplicación (least privilege)
- Redis con AUTH password + ACLs por usuario
- Comandos peligrosos deshabilitados (FLUSHDB, FLUSHALL, CONFIG)

## Datos personales

El sistema procesa información de clientes (nombre, teléfono, email, dirección).
Aplica la Ley Federal de Protección de Datos Personales en Posesión de los Particulares
(LFPDPPP) de México.

- Los datos NO se loggean (redact en Pino)
- Los datos viajan cifrados en tránsito (HTTPS)
- Los datos en reposo están en MongoDB con auth obligatoria
- El sistema NO almacena datos de tarjetas de crédito (modelo "efectivo contra entrega")
