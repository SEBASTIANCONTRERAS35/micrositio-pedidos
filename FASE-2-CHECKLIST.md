# Fase 2 — Código del API + Worker · Checklist

> Esta fase deja el backend completo: rutas, modelos, lógica de pedidos, multi-carrier delivery, tests baseline.
> Días 5–11 (sáb 17 mayo – sáb 24 mayo).

---

## Lo que YO ya hice (código generado)

### Estructura completa de la aplicación

#### Utils (api/utils/)
- [x] `logger.js` — Pino con redacción automática de PII (telefono, email, direccion, password, token)
- [x] `errors.js` — Clases de error tipadas (AppError, ValidationError, AuthError, NotFoundError, StockInsuficiente, etc.)
- [x] `hmac.js` — Verificación HMAC-SHA256 + replay attack prevention (timestamp window)

#### Servicios (api/services/)
- [x] `redis.js` — Cliente Redis singleton compartido
- [x] `cache.js` — Cache TTL in-memory (patrón inspirado en PaginaWeb)
- [x] `pedidoService.js` — Lógica core: crear pedido con stock atómico (transacción MongoDB), confirmar, cancelar
- [x] `auth/jwt.js` — JWT RS256 + refresh tokens en Redis con rotación
- [x] `auth/argon2.js` — Hash de passwords con Argon2id
- [x] `delivery/index.js` — Capa de abstracción multi-carrier
- [x] `delivery/providers/ivoy.js` — iVoy (sandbox real)
- [x] `delivery/providers/lalamove.js` — Lalamove (mock por defecto)
- [x] `delivery/providers/uberDirect.js` — Uber Direct (mock por defecto)

#### Middlewares (api/middlewares/)
- [x] `helmet.js` — Helmet con CSP configurado para EJS + Alpine.js
- [x] `rateLimit.js` — 3 limiters (público, webhook, auth) con backend Redis
- [x] `validation.js` — Factory para validar requests con schemas Zod
- [x] `idempotency.js` — Idempotency-Key con cache Redis (24h TTL)
- [x] `auth.js` — verifyAccessToken + check de revocación
- [x] `errorHandler.js` — Convierte errores a JSON consistente

#### Modelos Mongoose (api/models/)
- [x] `negocio.js` — Negocio simple (slug, nombre, tipo, telefono, direccion, deliveryProvider)
- [x] `producto.js` — Producto del catálogo
- [x] `usuario.js` — Dueño del negocio (email, passwordHash, negocioId)
- [x] `pedido.js` — CORE: cliente snapshot, productos snapshot, estado, delivery, historial. TTL automático de cancelados a 90 días

#### Rutas (api/routes/)
- [x] `health.js` — /live, /ready (verifica Mongo+Redis), /startup
- [x] `tienda.js` — /tienda/:slug (catálogo), /checkout, /pedido/:id (con cache 30 min)
- [x] `pedidos.js` — POST /api/pedidos (con Idempotency-Key + rate limit + Zod validation)
- [x] `auth.js` — login/refresh/logout (con rate limit estricto en login)
- [x] `panel.js` — Vistas EJS + endpoints JSON autenticados
- [x] `webhooks.js` — POST /webhooks/delivery con verificación HMAC + idempotencia BullMQ

#### Entry point
- [x] `api.js` — Express 5 con todos los middlewares + conexión MongoDB + graceful shutdown

#### Worker (worker/)
- [x] `index.js` — BullMQ con 3 colas: delivery, notificaciones, webhook-delivery
- [x] `jobs/delivery.js` — Solicitar repartidor al carrier
- [x] `jobs/notificaciones.js` — Email (Resend) + WhatsApp (Twilio Sandbox)
- [x] `jobs/webhookDelivery.js` — Procesar actualizaciones del carrier (idempotente)

#### Tests
- [x] `tests/unit/hmac.test.js` — verifica firma válida/inválida + timestamp
- [x] `tests/unit/validation.test.js` — Zod schemas
- [x] `tests/unit/argon2.test.js` — hash y verificación
- [x] `tests/integration/pedidos-atomicidad.test.js` — **CRÍTICO**: 10 pedidos concurrentes del último producto, solo 1 success

#### Otros
- [x] `vitest.config.js` — Coverage 70% mínimo
- [x] `vitest.integration.config.js` — Tests con Testcontainers (timeout 60s)
- [x] `scripts/seed-data.js` — Seed inicial (negocio demo + 5 productos + usuario demo@zuyu.local)
- [x] Verificación de seguridad: 0 referencias a ZUYU/PillDB/multi-tenant en el código

---

## Lo que TÚ tienes que hacer manualmente

### 1. Instalar dependencias (después de hacer commit del código)

```bash
cd /Users/emiliocontreras/Downloads/micrositio-pedidos

# Instala root + api + worker (npm workspaces)
npm install

# Verificar versiones
npm list --depth=0
```

### 2. Configurar Husky pre-commit hooks (una sola vez)

```bash
npx husky init
echo "npm run lint" > .husky/pre-commit
echo "npx --no -- commitlint --edit \$1" > .husky/commit-msg
```

### 3. Levantar todo con docker-compose (incluye api+worker ahora)

```bash
docker-compose up --build

# En otra terminal, esperar a que api responda y correr seed
npm run seed
# O directamente:
docker-compose exec api node /app/scripts/seed-data.js
```

> **Nota:** el seed asume que mongodb-init terminó OK. Si hay error, revisa logs con
> `docker-compose logs mongodb mongodb-init`.

### 4. Verificar manualmente que la app funciona

#### 4.1. Health checks
```bash
curl http://localhost:3000/health/live    # 200 OK
curl http://localhost:3000/health/ready   # 200 OK con checks: { mongo: true, redis: true }
```

#### 4.2. Tienda pública
- [ ] Abrir http://localhost:3000/tienda/demo
- [ ] Verificar que carga el catálogo con 5 productos
- [ ] Agregar productos al carrito
- [ ] Click en el icono del carrito → ver drawer con items
- [ ] Click en "Proceder al checkout"
- [ ] Llenar formulario y enviar pedido
- [ ] Verificar redirección a página de confirmación con pedidoId

#### 4.3. Panel del dueño
- [ ] Abrir http://localhost:3000/panel/login
- [ ] Login con `demo@zuyu.local` / `Demo1234!`
- [ ] Verificar que aparece la lista de pedidos
- [ ] Click en un pedido pendiente → ver detalle
- [ ] Click "Confirmar pedido" → estado cambia a "confirmado"
- [ ] Verificar logs del worker (debe mostrar "Repartidor solicitado" con mock)

### 5. Correr tests

```bash
cd /Users/emiliocontreras/Downloads/micrositio-pedidos/api

# Unit tests (rápido)
npm test

# Coverage report
npm run test:coverage
# Verificar coverage >= 70% en statements/branches/functions/lines
# Abrir coverage/index.html en browser

# Integration tests (Testcontainers — más lento)
npm run test:integration
# Verifica que la atomicidad de stock funciona bajo concurrencia
```

### 6. Build de la imagen Docker (production target)

```bash
cd /Users/emiliocontreras/Downloads/micrositio-pedidos

# Build de api con target production (distroless)
docker build --target production -t micrositio-api:dev ./api

# Verificar tamaño (debe ser ~150-200 MB con distroless, no 500+)
docker images micrositio-api

# Build de worker
docker build --target production -t micrositio-worker:dev ./worker

# Probar que la imagen production arranca
docker run --rm -e MONGODB_URI=mongodb://host.docker.internal:27017 micrositio-api:dev
# Debe imprimir logs de arranque
```

### 7. Trivy scan de las imágenes

```bash
# Instalar Trivy si no lo tienes
brew install aquasecurity/trivy/trivy  # macOS

# Scan de la imagen api
trivy image --severity HIGH,CRITICAL --exit-code 1 micrositio-api:dev
# Esperado: "0 critical, 0 high vulnerabilities"

# Si hay vulnerabilidades:
# - Si vienen de la base de Node 20-distroless → reportar a Google y esperar fix
# - Si vienen de tus dependencias npm → npm audit fix
```

### 8. Crear cuenta en Resend (notificaciones email)

- [ ] Ir a https://resend.com → Sign up gratis
- [ ] Verificar email
- [ ] API Keys → Create API Key → copiar
- [ ] Pegar en .env: `RESEND_API_KEY=re_xxx`
- [ ] Verificar dominio (o usar `onboarding@resend.dev` para pruebas)

### 9. Crear cuenta en Twilio Sandbox (WhatsApp)

- [ ] Ir a https://www.twilio.com → Sign up gratis (US$15 credito)
- [ ] Console → Develop → Messaging → Try it out → Send a WhatsApp message
- [ ] Sandbox: `whatsapp:+14155238886` con código `join <palabra>`
- [ ] Pegar en .env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN

### 10. Hacer commit del código

```bash
cd /Users/emiliocontreras/Downloads/micrositio-pedidos
git add .
git status   # revisar
git commit -m "feat: api+worker completo con seguridad y tests baseline"
git push
```

---

## Smoke tests críticos (para checkpoint)

### Test 1: Flujo end-to-end manual
1. http://localhost:3000/tienda/demo → catálogo carga ✅
2. Agregar producto al carrito ✅
3. Checkout → enviar pedido ✅
4. Página de confirmación con pedidoId ✅
5. http://localhost:3000/panel/login → login OK ✅
6. Panel muestra el pedido en estado "pendiente" ✅
7. Confirmar pedido → cambia a "confirmado" ✅
8. Logs del worker: "Repartidor solicitado" ✅

### Test 2: Stock atómico bajo concurrencia
```bash
cd api
npm run test:integration
# Test "10 pedidos concurrentes del ultimo producto: solo 1 success" debe PASAR
```

### Test 3: Webhook con firma HMAC
```bash
# Generar firma valida
BODY='{"orderId":"abc","status":"delivered"}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "test-secret" | awk '{print $2}')

# POST con firma valida
curl -X POST "http://localhost:3000/webhooks/delivery?provider=ivoy" \
  -H "Content-Type: application/json" \
  -H "x-ivoy-signature: $SIG" \
  -H "x-ivoy-timestamp: $(date +%s)" \
  -d "$BODY"
# Esperado: 200 OK { ok: true }

# POST con firma INVALIDA
curl -X POST "http://localhost:3000/webhooks/delivery?provider=ivoy" \
  -H "Content-Type: application/json" \
  -H "x-ivoy-signature: bad-signature-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "x-ivoy-timestamp: $(date +%s)" \
  -d "$BODY"
# Esperado: 401 WEBHOOK_SIGNATURE_INVALID
```

### Test 4: PII NO aparece en logs
```bash
# Hacer un pedido con datos reales
# Luego revisar logs del api
docker-compose logs api | grep -i "telefono\|email\|direccion\|password"
# Esperado: ninguna aparición de los valores reales (debe ser [REDACTED])
```

### Test 5: Rate limiting funciona
```bash
# Hacer 110 requests al endpoint de pedidos en <1 minuto
for i in {1..110}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/pedidos -X POST -H "Content-Type: application/json" -d '{}'
done | sort | uniq -c
# Esperado: ~100 con código 400 (validación) + ~10 con 429 (rate limit)
```

---

## Si algo sale mal — Troubleshooting

### `npm install` falla con peerDependencies
```bash
# Workspaces de npm puede dar problemas. Alternativa:
cd api && npm install
cd ../worker && npm install
```

### docker-compose: api se reinicia constantemente
```bash
docker-compose logs api
# Causas comunes:
# - MongoDB no está listo aún → esperar 30s
# - mongodb-init no terminó → ver: docker-compose logs mongodb-init
# - JWT_PRIVATE_KEY_PATH no existe → en dev se genera ephemeral, debe funcionar
```

### Tests de integración fallan con timeout
```bash
# Testcontainers necesita Docker corriendo y tiempo para descargar mongo:7.0
# Primera ejecución: 2-3 min. Subsiguientes: 30s
# Si falla, asegurar que Docker tiene >= 4GB RAM asignados
```

### "rs.status() not a function" al inicializar
```bash
# El init job del docker-compose debe ejecutar después de que mongodb está healthy
# Si no, manualmente:
docker-compose exec mongodb mongosh --eval "rs.initiate()"
```

---

## Checkpoint final de Fase 2

✅ **PASA si**:
- `docker-compose up` levanta api+worker+mongo+redis sin errores
- http://localhost:3000/tienda/demo muestra catálogo con 5 productos
- Flujo de pedido end-to-end funciona en navegador
- Login al panel funciona y muestra pedidos
- `npm test` (unit) pasa con coverage >= 70%
- `npm run test:integration` pasa el test de atomicidad
- Trivy scan de la imagen final: 0 críticos
- Webhook con firma inválida → 401; con firma válida → 200
- PII no aparece en logs (todo redactado)

🔴 **FALLA si**:
- Algún test integration falla (especialmente atomicidad de stock)
- La imagen Docker pesa >300 MB (revisar que se usa distroless)
- npm audit reporta vulnerabilidades críticas
- Logs muestran teléfonos/emails reales (redact roto)
- Webhook acepta firmas inválidas (HMAC roto)

---

## Lo que viene en Fase 3+

- Manifestos K8s para api/worker (Deployments, Services, Ingress)
- NetworkPolicies (default-deny + 5 reglas)
- Sealed Secrets para .env de producción
- KEDA ScaledObject para escalar el worker
- Loki + Alloy + Prometheus
- Tekton + ArgoCD pipeline
- Argo Rollouts canary + AnalysisTemplate

---

## Tiempo estimado total Fase 2
- Mi parte: ya hecha (~3000 líneas de código)
- Tu parte: ~6 horas (instalar, levantar, probar manualmente, fix de detalles)
