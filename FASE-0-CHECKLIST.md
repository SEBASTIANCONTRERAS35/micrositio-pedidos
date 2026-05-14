# Fase 0 — Setup del Repositorio · Checklist

> Esta fase deja el repositorio listo con tooling de calidad antes de escribir código de negocio.
> Fecha objetivo: Día 1 (martes 13 de mayo de 2026).

---

## Lo que YO ya hice (no requiere acción tuya)

- [x] Estructura de carpetas creada (api/, worker/, k8s/, tekton/, argocd/, monitoring/, docs/, scripts/)
- [x] `package.json` raíz con workspaces npm
- [x] `package.json` de api con todas las dependencias (Express 5, Mongoose, Zod, BullMQ, Pino, etc.)
- [x] `package.json` de worker con dependencias (BullMQ, Resend, Twilio)
- [x] ESLint flat config (`eslint.config.js`)
- [x] Prettier config (`.prettierrc.json` + `.prettierignore`)
- [x] Commitlint config (`commitlint.config.js`)
- [x] `.gitignore` completo (excluye .env, secrets, node_modules)
- [x] `.env.example` con TODAS las variables necesarias documentadas
- [x] `README.md` con instrucciones de setup y deploy
- [x] `SECURITY.md` con prácticas de seguridad
- [x] `CONTRIBUTING.md` con convenciones
- [x] `docker-compose.yml` con MongoDB Replica Set + Redis + api + worker
- [x] EJS templates copiados de PaginaWeb y SANITIZADOS:
  - [x] `api/views/tienda/index.ejs` (catálogo + cart drawer Alpine.js)
  - [x] `api/views/tienda/checkout.ejs` (formulario de pedido)
  - [x] `api/views/tienda/pedido-confirmacion.ejs`
  - [x] `api/views/tienda/404.ejs`
  - [x] `api/views/panel/login.ejs`
  - [x] `api/views/panel/pedidos.ejs` (panel del dueño con polling)
- [x] CSS adaptado de PaginaWeb (`api/public/css/tienda.css`, `checkout.css`, `panel.css`)
- [x] Alpine.js descargado standalone (no depende de CDN)
- [x] Dockerfile multi-stage distroless (api y worker)
- [x] Verificación de seguridad: `grep` confirma 0 referencias a ZUYU/PillDB/multi-tenant

---

## Lo que TÚ tienes que hacer manualmente

### 1. Mandar correo a Daniel confirmando 5 de junio
```
Asunto: Confirmado, 5 de junio

Profe,
Va, confirmado el 5 de junio. Hoy mismo arranco con todo.
Voy a apuntar al alcance completo y a meter los puntos extra si me alcanza el tiempo,
pero le aviso si veo que alguno se complica.
Cualquier duda en el camino se la mando.

Gracias,
Sebas
```

### 2. Avisar a Mike (cofounder ZUYU)
> "Estoy en modo proyecto universitario 3 semanas. Pausamos features nuevas en ZUYU del 13 mayo al 5 junio."

### 3. Verificar que el repo está en GitHub
- [ ] Ir a https://github.com/SEBASTIANCONTRERAS35/micrositio-pedidos
- [ ] Confirmar que es **PRIVADO**
- [ ] El repo está vacío (sin commits) — eso es correcto

### 4. Hacer el primer commit y push
```bash
cd /Users/emiliocontreras/Downloads/micrositio-pedidos
git add .
git status   # revisa qué se va a subir
git commit -m "feat: setup inicial repo + estructura + tooling"
git push origin main
```

### 5. Validar que todo funciona localmente

```bash
cd /Users/emiliocontreras/Downloads/micrositio-pedidos

# Instalar Husky pre-commit hooks (se necesita una vez)
npm install

# Levantar Mongo + Redis + Replica Set con Docker Compose
docker-compose up -d mongodb redis mongodb-init

# Verificar que MongoDB Replica Set arrancó
docker-compose exec mongodb mongosh --eval "rs.status()"
# Debe mostrar: members: [{state: PRIMARY}]

# Verificar Redis
docker-compose exec redis redis-cli -a devpassword ping
# Debe mostrar: PONG
```

> ⚠️ **IMPORTANTE**: el api y worker en docker-compose AÚN NO arrancan porque
> falta el código de la app (Fase 2). Los crearemos en la siguiente fase.

---

## Validaciones automáticas que YA pasan

- [x] `grep` no encuentra referencias a ZUYU
- [x] Estructura de carpetas coincide con la rúbrica de Daniel (api/, worker/, k8s/, etc.)
- [x] `.env` está en `.gitignore`
- [x] `node_modules/` está en `.gitignore`

---

## Lo que SÍ NO hagas todavía (próximas fases)

- ❌ NO instalar Husky completo (lo hacemos en Fase 2 cuando haya código JS para validar)
- ❌ NO levantar api/worker en docker-compose (falta código)
- ❌ NO cambiar el repo a público (eso es el día 4 de junio)
- ❌ NO subir secrets reales al .env del repo (solo .env.example)

---

## Checkpoint final de Fase 0

✅ **PASA si**:
- Tienes el repo privado en GitHub con primer commit
- `docker-compose up -d mongodb redis mongodb-init` funciona
- `mongosh` muestra Replica Set inicializado
- `redis-cli ping` responde PONG

🔴 **FALLA si**:
- El repo está vacío en GitHub (no hiciste push)
- El docker-compose da errores de mongoose/redis al arrancar
- Hay archivos `.env` o `node_modules/` subidos al repo

---

## Tiempo estimado total Fase 0
- Mi parte: ya hecha
- Tu parte: ~30 minutos
