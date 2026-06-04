# 🎤 Guía MANUAL de Defensa — micrositio

> Pasos EXACTOS para hacer cada demo **a mano** (sin correr los scripts), en vivo frente al profe.
> Dos ventanas: **Navegador** (Mac, /etc/hosts → zuyu.local) y **Terminal (master)** con kubectl.
> Credenciales panel: `demo@zuyu.local` / `Demo1234!` · negocio slug `demo`.
> ⚠️ La IP del ingress se resuelve dinámicamente con `$IP` (la vieja .37 está muerta).

## Índice
1. Flujo completo del pedido: cliente -> dueno -> repartidor -> entrega  _(pts: 5 (App funcional), ~4-5 minutos)_
2. Demo 2 — MongoDB Replica Set failover (matar PRIMARY -> re-eleccion automatica)  _(pts: 15 (MongoDB RS), ~3-4 min (la re-eleccion de PRIMARY ocurre en <10s; el resto es esperar que el nodo muerto reingrese como SECONDARY, ~30-60s))_
3. DEMO 3 — NetworkPolicy bloquea un pod no autorizado (zero-trust con Calico)  _(pts: 15 (NetworkPolicy), 2-3 minutos)_
4. DEMO 4 — KEDA escala el worker 1→5 por la cola y baja a 1 al drenar  _(pts: 15 (KEDA), 5–8 minutos (scale-up ~30–90s con carga sostenida; scale-down ~2–4 min mientras drena la cola por el cooldown de KEDA))_
5. DEMO 5 - CI/CD: git push -> Tekton build -> ArgoCD sync -> deploy  _(pts: 15 (CI/CD), 5-7 minutos (la build de Tekton tarda ~2 min; si el tiempo aprieta, lanza el push, sigue narrando ArgoCD/rollout y vuelves a Tekton al final))_
6. Argo Rollouts Canary 10→50→100 con análisis automático  _(pts: 10 (Canary), 3-4 minutos)_
7. Observabilidad: seguir un pedidoId en Loki/Grafana  _(pts: 10 (Observabilidad), 3-4 minutos)_
8. Seguridad: Webhook iVoy firmado con HMAC (valida -> 200, sin firma -> 401, replay -> 401)  _(pts: seguridad, 6-8 minutos)_


---

# RUNBOOK MANUAL - Demo 1: Flujo completo del pedido (cliente -> dueno -> repartidor -> entrega)

> Demostracion EN VIVO, paso a paso, sin ejecutar el script. Tienes dos ventanas a mano: un **Navegador** (Safari/Chrome con `/etc/hosts` apuntando `zuyu.local` al cluster) y una **Terminal (master)** con `kubectl` configurado.
>
> Pre-requisito: ya se corrio `bash demos/seed-data.sh` una vez (negocio "demo" = Farmacia Demo, 3 productos, usuario dueno `demo@zuyu.local`). Si el login falla mas adelante, ese seed es lo que falta.

---

## SETUP (Terminal master) - hacer ANTES de empezar

### Paso 0a - Resolver la IP del ingress (la IP del script esta muerta)
- **DONDE:** Terminal (master)
- **ACCION:** Guarda en `$IP` la IP real del nodo donde corre el ingress controller.
- **COMANDO:**
```bash
IP=$(kubectl get pod -n ingress-nginx -l app.kubernetes.io/component=controller -o jsonpath='{.items[0].status.hostIP}'); echo $IP
```
- **NARRACION:** "Primero resuelvo dinamicamente la IP del ingress, asi no dependo de IPs cableadas."
- **ESPERADO:** Imprime una IP (ej. `10.211.55.x`). No debe quedar vacia.

### Paso 0b - Cargar la contrasena de la app de MongoDB en variable
- **DONDE:** Terminal (master)
- **ACCION:** Lee el secreto `mongodb-users` y guarda `APP_PASSWORD` en `$APP_PASS` (sin exponer el valor).
- **COMANDO:**
```bash
APP_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.APP_PASSWORD}' | base64 -d); echo "len=${#APP_PASS}"
```
- **NARRACION:** "Las credenciales nunca van en claro: las saco del Secret de Kubernetes en una variable."
- **ESPERADO:** Imprime `len=` seguido de un numero mayor que 0 (la contrasena queda en memoria, no en pantalla).

---

## PARTE 1 - El CLIENTE entra a la tienda y pide

### Paso 1 - Cliente abre el catalogo (visual)
- **DONDE:** Navegador
- **ACCION:** Abre la tienda publica del negocio "demo".
- **URL:**
```
https://zuyu.local/tienda/demo
```
- **NARRACION:** "Este es el micrositio que ve el cliente final: catalogo de la Farmacia Demo servido por HTTPS a traves del ingress."
- **ESPERADO:** Carga la pagina de la tienda con los productos (Paracetamol, Ibuprofeno, etc.). El candado de HTTPS aparece (certificado del cluster).

### Paso 2 - (Terminal) Obtener los IDs reales de 2 productos del negocio demo
- **DONDE:** Terminal (master)
- **ACCION:** Consulta MongoDB para sacar 2 `productoId` que pertenezcan al negocio "demo" (filtrando por `negocioId`, no productos de otros negocios).
- **COMANDO:**
```bash
PROD_IDS=$(kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio \
  --eval 'const n=db.negocios.findOne({slug:"demo"}); db.productos.find({negocioId:n._id},{_id:1}).limit(2).toArray().map(p => p._id.toString()).join(" ")' 2>/dev/null | tail -1)
PROD1=$(echo $PROD_IDS | awk '{print $1}'); PROD2=$(echo $PROD_IDS | awk '{print $2}')
echo "PROD1=$PROD1  PROD2=$PROD2"
```
- **NARRACION:** "Tomo dos productos reales de este negocio directo del ReplicaSet; si pidiera IDs de otro negocio el POST daria 404."
- **ESPERADO:** `PROD1=` y `PROD2=` con dos ObjectId de 24 caracteres cada uno.

### Paso 3 - Cliente crea el pedido (POST /api/pedidos)
- **DONDE:** Terminal (master)
- **ACCION:** Manda el pedido como lo haria la tienda: 2 Paracetamol + 1 Ibuprofeno, pago en efectivo.
- **COMANDO:**
```bash
RESP=$(curl -ks --resolve zuyu.local:443:$IP -X POST https://zuyu.local/api/pedidos \
  -H "Content-Type: application/json" \
  -d "{
    \"negocioSlug\": \"demo\",
    \"cliente\": {\"nombre\":\"Juan Perez\",\"telefono\":\"+525555550100\",\"email\":\"juan@example.com\",\"direccion\":\"Av. Reforma 100, CDMX\"},
    \"productos\": [{\"id\":\"$PROD1\",\"cantidad\":2},{\"id\":\"$PROD2\",\"cantidad\":1}],
    \"metodoPago\": \"efectivo\"
  }")
PEDIDO_ID=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("pedidoId",""))')
TOTAL=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("total",""))')
echo "Pedido $PEDIDO_ID creado, total \$$TOTAL (estado: pendiente)"
```
- **NARRACION:** "El cliente envia el pedido; la API lo persiste y me devuelve el folio y el total calculado en el servidor."
- **ESPERADO:** `Pedido <id> creado, total $175 (estado: pendiente)` (2x50 + 1x75 = 175). `PEDIDO_ID` no debe quedar vacio.

---

## PARTE 2 - El DUENO entra al panel y confirma

### Paso 4 - Dueno abre el panel (visual)
- **DONDE:** Navegador
- **ACCION:** Abre el login del panel del dueno.
- **URL:**
```
https://zuyu.local/panel/login
```
- **NARRACION:** "Ahora cambio de sombrero: soy el dueno del negocio y entro a mi panel de administracion."
- **ESPERADO:** Aparece el formulario de login del panel.

### Paso 5 - Dueno inicia sesion (visual)
- **DONDE:** Navegador
- **ACCION:** Captura credenciales demo y entra.
- **CLIC / DATOS:**
```
Email:    demo@zuyu.local
Password: Demo1234!
[ Iniciar sesion ]
```
- **NARRACION:** "Me autentico como dueno; el backend valida el hash Argon2 y me emite un JWT."
- **ESPERADO:** Entra al panel y se ve el pedido de Juan Perez en estado "pendiente".

### Paso 6 - (Terminal) Obtener el JWT del dueno via API
- **DONDE:** Terminal (master)
- **ACCION:** Hace el mismo login por API para tener el token y poder confirmar por curl en vivo.
- **COMANDO:**
```bash
LOGIN_RESP=$(curl -ks --resolve zuyu.local:443:$IP -X POST https://zuyu.local/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@zuyu.local","password":"Demo1234!"}')
JWT=$(echo "$LOGIN_RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken",""))')
echo "JWT: ${JWT:0:30}..."
```
- **NARRACION:** "El mismo login por API me da el JWT que protege las rutas privadas del dueno."
- **ESPERADO:** `JWT: eyJ...` (un token). Si sale vacio, falta correr `bash demos/seed-data.sh`.

### Paso 7 - Dueno confirma el pedido (POST .../confirmar con JWT)
- **DONDE:** Terminal (master)
- **ACCION:** Confirma el pedido pasando el JWT como Bearer.
- **COMANDO:**
```bash
curl -ks --resolve zuyu.local:443:$IP -X POST "https://zuyu.local/api/pedidos/$PEDIDO_ID/confirmar" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" | python3 -m json.tool | head -8
```
- **NARRACION:** "Al confirmar, la ruta exige el JWT y dispara un job de delivery en la cola."
- **ESPERADO:** JSON con el pedido en estado `confirmado` (y un mensaje OK). Sin token daria 401.

---

## PARTE 3 - El WORKER asigna repartidor

### Paso 8 - Ver al worker procesar el job de delivery
- **DONDE:** Terminal (master)
- **ACCION:** Espera unos segundos y revisa los logs del worker buscando el procesamiento del repartidor. (En vivo: deja correr ~5 s antes de mirar.)
- **COMANDO:**
```bash
kubectl logs -n micrositio deploy/worker --tail=15 | grep -iE "delivery|repartidor|Procesando" | tail -3
```
- **NARRACION:** "El worker de BullMQ toma el job, llama al carrier iVoy y asigna el repartidor de forma asincrona."
- **ESPERADO:** Lineas de log que mencionan "delivery"/"repartidor"/"Procesando" (el job se proceso).

### Paso 9 - Confirmar el estado del pedido en MongoDB (con carrier)
- **DONDE:** Terminal (master)
- **ACCION:** Lee el pedido en la BD para ver el estado y el carrier asignado.
- **COMANDO:**
```bash
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio --eval "
const p = db.pedidos.findOne({pedidoId: '$PEDIDO_ID'});
print('Estado: ' + p.estado);
if (p.delivery) { print('Carrier: ' + (p.delivery.proveedor || 'pendiente')); print('Tracking: ' + (p.delivery.trackingUrl || 'pendiente')); }
" 2>&1 | tail -5
```
- **NARRACION:** "En la base ya quedo el pedido confirmado con su proveedor de entrega y la URL de tracking."
- **ESPERADO:** `Estado: confirmado`, `Carrier: ivoy`, `Tracking: <url>`.

---

## PARTE 4 - ENTREGA via webhook firmado (HMAC)

### Paso 10 - Obtener el deliveryId real asignado por el carrier
- **DONDE:** Terminal (master)
- **ACCION:** El webhook debe referenciar el `deliveryId` real que asigno iVoy (no uno inventado).
- **COMANDO:**
```bash
DELIVERY_ID=$(kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio \
  --eval "const p=db.pedidos.findOne({pedidoId:'$PEDIDO_ID'}); print(p && p.delivery ? p.delivery.deliveryId : '')" 2>/dev/null | tail -1 | tr -d '[:space:]')
echo "DELIVERY_ID=$DELIVERY_ID"
```
- **NARRACION:** "El webhook localiza el pedido por el deliveryId real del carrier, asi que lo saco de la base."
- **ESPERADO:** `DELIVERY_ID=` con un identificador no vacio.

### Paso 11 - Firmar el cuerpo del webhook con HMAC-SHA256
- **DONDE:** Terminal (master)
- **ACCION:** Construye el body "entregado" y lo firma con el secreto del webhook (sin exponer el secreto).
- **COMANDO:**
```bash
WEBHOOK_SECRET=$(kubectl get secret api-env -n micrositio -o jsonpath='{.data.WEBHOOK_SECRET_IVOY}' | base64 -d)
TIMESTAMP=$(date +%s)
WEBHOOK_BODY="{\"orderId\":\"$DELIVERY_ID\",\"status\":\"delivered\",\"pedidoId\":\"$PEDIDO_ID\",\"timestamp\":$TIMESTAMP}"
SIG=$(printf '%s' "$WEBHOOK_BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | awk '{print $NF}')
echo "Signature: sha256=${SIG:0:16}..."
```
- **NARRACION:** "Firmo el payload con HMAC-SHA256 usando el secreto del carrier; asi la API confia en que el webhook es legitimo."
- **ESPERADO:** `Signature: sha256=...` (16 chars visibles, el resto oculto).

### Paso 12 - Enviar el webhook "entregado"
- **DONDE:** Terminal (master)
- **ACCION:** Postea el webhook firmado al endpoint de delivery (provider=ivoy).
- **COMANDO:**
```bash
curl -ks --resolve zuyu.local:443:$IP \
  -X POST "https://zuyu.local/webhooks/delivery?provider=ivoy" \
  -H "Content-Type: application/json" \
  -H "x-ivoy-signature: sha256=$SIG" \
  -H "x-ivoy-timestamp: $TIMESTAMP" \
  -d "$WEBHOOK_BODY" \
  -w "    HTTP %{http_code}\n" -o /dev/null
```
- **NARRACION:** "El carrier nos avisa que se entrego; la API verifica la firma antes de aceptar el cambio de estado."
- **ESPERADO:** `HTTP 200` (firma valida y pedido actualizado). Un `401/400` significaria firma invalida.

### Paso 13 - Verificar el estado FINAL en la BD (entregado + historial)
- **DONDE:** Terminal (master)
- **ACCION:** Espera ~3 s y consulta el estado final y el historial completo del pedido.
- **COMANDO:**
```bash
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio --eval "
const p = db.pedidos.findOne({pedidoId: '$PEDIDO_ID'});
print('Estado: ' + p.estado);
print('Historial:');
(p.historial || []).forEach(h => print('  - ' + h.estado + ' @ ' + h.timestamp));
" 2>&1 | tail -8
```
- **NARRACION:** "El pedido recorrio todo el ciclo: pendiente, confirmado y entregado, con su historial completo."
- **ESPERADO:** `Estado: entregado` y un historial con las transiciones (pendiente -> confirmado -> entregado).

### Paso 14 (opcional, visual) - Mostrar el pedido entregado en el panel
- **DONDE:** Navegador
- **ACCION:** Recarga el panel del dueno para ver el pedido marcado como entregado.
- **URL:**
```
https://zuyu.local/panel/login
```
- **NARRACION:** "Y del lado del dueno, el panel ya refleja el pedido como entregado: el ciclo cerro completo."
- **ESPERADO:** El pedido de Juan Perez aparece en estado "entregado".

---

## CIERRE
> "Flujo completo end-to-end: cliente por HTTPS -> MongoDB ReplicaSet -> dueno con JWT -> worker BullMQ -> webhook firmado con HMAC -> estado entregado."


**🎯 Frase de cierre:** _Flujo completo end-to-end: el cliente pide por HTTPS, MongoDB ReplicaSet lo persiste, el dueno confirma con JWT, el worker BullMQ solicita repartidor y el webhook firmado con HMAC marca el pedido como entregado._


---

# RUNBOOK MANUAL — Demo 2: MongoDB Replica Set failover

> Objetivo en vivo: mostrar que MongoDB corre como Replica Set de 3 nodos (1 PRIMARY + 2 SECONDARY) en 3 maquinas distintas; al MATAR el PRIMARY, el RS elige uno nuevo en <10s y la app sigue respondiendo. Luego el nodo muerto reingresa solo como SECONDARY.
>
> Pre-requisitos: estar en la **Terminal (master)** con `kubectl` apuntando al cluster, y tener `/etc/hosts` del Mac con `zuyu.local`. Todos los comandos `kubectl`/`mongosh` van en la Terminal del master.

---

## SETUP (Terminal master) — hacer ANTES de empezar

### Paso 0a — Resolver la IP del ingress (la del script esta muerta)
- **DONDE:** Terminal (master)
- **ACCION:** Obtener la IP real del nodo donde corre el ingress-nginx y guardarla en `$IP`.
- **COMANDO:**
```bash
IP=$(kubectl get pod -n ingress-nginx -l app.kubernetes.io/component=controller -o jsonpath='{.items[0].status.hostIP}'); echo $IP
```
- **NARRACION:** "Primero resuelvo la IP del ingress que da acceso a la app, para probar despues que sigue viva durante el failover."
- **ESPERADO:** Imprime una IP del cluster (ej. `10.211.55.xx`), NO vacia.

### Paso 0b — Cargar la contrasena root de Mongo en una variable (sin exponerla)
- **DONDE:** Terminal (master)
- **ACCION:** Leer el secret `mongodb-users` y dejar el password en `$ROOT_PASS`.
- **COMANDO:**
```bash
ROOT_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.MONGO_INITDB_ROOT_PASSWORD}' | base64 -d)
```
- **NARRACION:** "Las credenciales viven en un Secret de Kubernetes; las cargo en una variable, nunca las muestro en pantalla."
- **ESPERADO:** Sin salida (la variable queda cargada). Si quieres confirmar que no esta vacia: `[ -n "$ROOT_PASS" ] && echo OK`.

---

## DEMO EN VIVO

### Paso 1 — Estado ANTES: ver los 3 pods distribuidos
- **DONDE:** Terminal (master)
- **ACCION:** Listar los pods de MongoDB con el nodo (maquina) donde corre cada uno.
- **COMANDO:**
```bash
kubectl get pods -n micrositio -l app=mongodb -o wide
```
- **NARRACION:** "Aqui estan mis 3 nodos de Mongo, y fijense en la columna NODE: cada uno corre en una maquina fisica distinta."
- **ESPERADO:** 3 pods `mongodb-0`, `mongodb-1`, `mongodb-2` en estado `Running`, con valores DISTINTOS en la columna `NODE`.

### Paso 2 — Estado ANTES del Replica Set (quien es PRIMARY/SECONDARY)
- **DONDE:** Terminal (master)
- **ACCION:** Conectar con mongosh dentro de `mongodb-0` y listar el rol de cada miembro.
- **COMANDO:**
```bash
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u root -p "$ROOT_PASS" --authenticationDatabase admin \
  --eval 'rs.status().members.forEach(m => print(m.name.split(".")[0].padEnd(12) + m.stateStr))'
```
- **NARRACION:** "Le pregunto al Replica Set su estado: deben verse un PRIMARY y dos SECONDARY, todos sanos."
- **ESPERADO:** Tres lineas, una `PRIMARY` y dos `SECONDARY`, ej.:
```
mongodb-0   PRIMARY
mongodb-1   SECONDARY
mongodb-2   SECONDARY
```

### Paso 3 — Identificar y guardar el PRIMARY actual
- **DONDE:** Terminal (master)
- **ACCION:** Extraer el nombre del pod PRIMARY a la variable `$PRIMARY`.
- **COMANDO:**
```bash
PRIMARY=$(kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u root -p "$ROOT_PASS" --authenticationDatabase admin \
  --eval 'rs.status().members.find(m=>m.stateStr=="PRIMARY").name.split(".")[0]' | tr -d '[:space:]'); echo "PRIMARY actual: $PRIMARY"
```
- **NARRACION:** "Guardo cual es el PRIMARY ahora mismo, porque es justo el que voy a sacrificar."
- **ESPERADO:** `PRIMARY actual: mongodb-0` (o el que corresponda; quedate con ese nombre).

### Paso 4 — MATAR el pod PRIMARY
- **DONDE:** Terminal (master)
- **ACCION:** Borrar el pod PRIMARY (simula caida de la maquina).
- **COMANDO:**
```bash
kubectl delete pod "$PRIMARY" -n micrositio --grace-period=5
```
- **NARRACION:** "Ahora mato el PRIMARY a proposito, como si esa maquina se cayera; aqui empieza el cronometro del failover."
- **ESPERADO:** `pod "<PRIMARY>" deleted`.

### Paso 5 — Confirmar que se eligio un NUEVO PRIMARY (<10s)
- **DONDE:** Terminal (master)
- **ACCION:** Preguntar el estado desde un nodo VIVO (`mongodb-1`). Repetir 2-3 veces si hace falta hasta ver un PRIMARY distinto.
- **COMANDO:**
```bash
kubectl exec mongodb-1 -n micrositio -c mongodb -- mongosh --quiet \
  -u root -p "$ROOT_PASS" --authenticationDatabase admin \
  --eval 'var p=rs.status().members.find(m=>m.stateStr=="PRIMARY"); print("Nuevo PRIMARY: " + (p ? p.name.split(".")[0] : "eligiendo..."))'
```
- **NARRACION:** "Le pregunto al cluster desde otro nodo y ya hay un PRIMARY nuevo: la re-eleccion fue automatica, en menos de 10 segundos."
- **ESPERADO:** `Nuevo PRIMARY: mongodb-1` (o `mongodb-2`), DISTINTO del que mataste. Si sale `eligiendo...`, repite el comando una vez.

### Paso 6 — Estado del RS durante el failover
- **DONDE:** Terminal (master)
- **ACCION:** Listar de nuevo el rol de cada miembro desde el nodo vivo.
- **COMANDO:**
```bash
kubectl exec mongodb-1 -n micrositio -c mongodb -- mongosh --quiet \
  -u root -p "$ROOT_PASS" --authenticationDatabase admin \
  --eval 'rs.status().members.forEach(m => print(m.name.split(".")[0].padEnd(12) + m.stateStr))'
```
- **NARRACION:** "Vista completa: hay un nuevo PRIMARY, un SECONDARY, y el nodo caido aparece como caido o reincorporandose."
- **ESPERADO:** Un `PRIMARY` (el nuevo), al menos un `SECONDARY`, y el nodo muerto en `(not reachable/healthy)` o ya `STARTUP`/`SECONDARY` si volvio rapido.

### Paso 7 — La APP sigue respondiendo (auto-reconnect del driver)
- **DONDE:** Terminal (master)
- **ACCION:** Pegarle al health endpoint a traves del ingress, usando `$IP`.
- **COMANDO:**
```bash
curl -k --resolve zuyu.local:443:$IP -s -o /dev/null -w "  HTTPS health/live: %{http_code} en %{time_total}s\n" https://zuyu.local/health/live
```
- **NARRACION:** "Y lo importante: la app no se cayo. El driver de Node se reconecto solo al nuevo PRIMARY, el health responde 200."
- **ESPERADO:** `HTTPS health/live: 200 en 0.0Xs`.

### Paso 8 (VISUAL, opcional) — Comprobar la tienda en el navegador
- **DONDE:** Navegador
- **ACCION:** Abrir la tienda demo; debe cargar pese al failover.
- **COMANDO / URL:**
```
https://zuyu.local/tienda/demo
```
- **NARRACION:** "Incluso visualmente, la tienda del negocio demo sigue cargando productos sin interrupcion."
- **ESPERADO:** La pagina de la tienda carga normal (productos visibles). (Si pide login del panel: `https://zuyu.local/panel/login` con `demo@zuyu.local` / `Demo1234!`.)

### Paso 9 — El nodo muerto reingresa solo como SECONDARY
- **DONDE:** Terminal (master)
- **ACCION:** Esperar ~30-60s y volver a consultar el estado; el pod que mataste debe haber sido recreado por el StatefulSet y reincorporado.
- **COMANDO:**
```bash
kubectl exec mongodb-1 -n micrositio -c mongodb -- mongosh --quiet \
  -u root -p "$ROOT_PASS" --authenticationDatabase admin \
  --eval "var m=rs.status().members.find(x=>x.name.startsWith(\"$PRIMARY\")); print(\"$PRIMARY -> \" + (m ? m.stateStr : 'pendiente'))"
```
- **NARRACION:** "Kubernetes recreo el pod que mate, y por si solo se reincorporo al Replica Set como SECONDARY: el cluster se auto-sano."
- **ESPERADO:** `mongodb-0 -> SECONDARY` (o `PRIMARY` si volvio a ganar; ambos casos = reincorporado sano).

### Paso 10 — Cierre
- **DONDE:** (hablado)
- **ACCION:** Resumir el resultado.
- **NARRACION:** "El Replica Set tolera la caida de un nodo sin downtime de la app: failover automatico en menos de 10 segundos y auto-recuperacion del nodo caido."
- **ESPERADO:** RS de 3 nodos sano, app en 200.

---

## NOTAS / TROUBLESHOOTING
- **IP del script muerta:** el script original usa `10.211.55.37` hardcodeada (muerta). Por eso en Setup obtienes `$IP` real y usas `--resolve zuyu.local:443:$IP`.
- **Si `$PRIMARY` fuera `mongodb-1`:** en los pasos 5/6/9 cambia el pod-ejecutor a uno VIVO (ej. `mongodb-0` o `mongodb-2`) para no consultar al nodo que mataste.
- **Si la re-eleccion tarda:** repite el comando del Paso 5; normalmente toma 3-8s.
- **Nunca exponer secretos:** el password siempre via `$ROOT_PASS`; no lo imprimas.

**🎯 Frase de cierre:** _El Replica Set de 3 nodos tolera la caida del PRIMARY sin downtime de la app: un SECONDARY se elige PRIMARY en menos de 10 segundos y el nodo muerto reingresa solo como SECONDARY._


---

# RUNBOOK MANUAL — DEMO 3: NetworkPolicy bloquea un pod no autorizado

**Duracion:** 2-3 min · **Puntos:** 15 (NetworkPolicy)
**Idea central:** En el namespace `micrositio` hay una NetworkPolicy `default-deny-all`. Cualquier pod nuevo sin las etiquetas permitidas NO puede hablar con Mongo ni con Redis. Quien lo enforce es **Calico** (Flannel no podria).

> Todos los `kubectl` se ejecutan en la **Terminal (master)**. No corras el script; teclea los comandos uno a uno.

---

## SETUP (Terminal — master)

### Paso 0 — Resolver la IP viva del Ingress
- **DONDE:** Terminal (master)
- **ACCION:** Obtener la IP del nodo donde corre el ingress-nginx (la IP del script esta muerta; usa esta variable).
```bash
IP=$(kubectl get pod -n ingress-nginx -l app.kubernetes.io/component=controller -o jsonpath='{.items[0].status.hostIP}'); echo $IP
```
- **NARRACION:** "Primero fijo la IP real del ingress en una variable, asi nada depende de IPs hardcodeadas."
- **ESPERADO:** Imprime una IP del cluster (ej. `10.211.55.x`), no vacia.

---

## PARTE A — Mostrar las politicas activas

### Paso 1 — Listar las NetworkPolicies del namespace
- **DONDE:** Terminal (master)
- **ACCION:** Ver todas las policies que protegen `micrositio`.
```bash
kubectl get netpol -n micrositio
```
- **NARRACION:** "Estas son las NetworkPolicies del namespace: una default-deny y varias allow especificas por etiqueta."
- **ESPERADO:** Lista con `default-deny-all`, `allow-api-to-mongo`, `allow-mongo-from-api-worker`, `allow-redis...`, etc.

### Paso 2 — Inspeccionar la default-deny-all
- **DONDE:** Terminal (master)
- **ACCION:** Mostrar el spec de la politica que niega todo por defecto.
```bash
kubectl get netpol default-deny-all -n micrositio -o yaml | grep -A8 "spec:"
```
- **NARRACION:** "La default-deny aplica a todos los pods (podSelector vacio) y corta Ingress y Egress salvo lo que se permita explicitamente."
- **ESPERADO:** Un `spec:` con `podSelector: {}` y `policyTypes: [Ingress, Egress]`.

---

## PARTE B — Pod ROGUE (no autorizado) → debe ser BLOQUEADO

### Paso 3 — Lanzar el pod rogue en el namespace `default`
- **DONDE:** Terminal (master)
- **ACCION:** Crear un pod sin etiquetas permitidas, fuera de `micrositio`.
```bash
kubectl delete pod rogue --ignore-not-found --grace-period=0 --force
kubectl run rogue --image=nicolaka/netshoot --restart=Never --command -- sleep 600
```
- **NARRACION:** "Levanto un pod intruso, sin label app=api y fuera del namespace; simula un contenedor comprometido."
- **ESPERADO:** `pod/rogue created`.

### Paso 4 — Esperar a que el rogue este Running
- **DONDE:** Terminal (master)
- **ACCION:** Confirmar que el pod ya arranco antes de probar conectividad.
```bash
kubectl wait --for=condition=Ready pod/rogue --timeout=60s
```
- **NARRACION:** "Espero a que el intruso este corriendo; el bloqueo es de red, no porque el pod no exista."
- **ESPERADO:** `pod/rogue condition met`.

### Paso 5 — rogue → MongoDB (debe FALLAR)
- **DONDE:** Terminal (master)
- **ACCION:** Intentar abrir socket a Mongo desde el pod no autorizado.
```bash
kubectl exec rogue -- nc -zv -w 5 mongodb-0.mongodb-headless.micrositio.svc.cluster.local 27017
```
- **NARRACION:** "El rogue intenta tocar Mongo y la NetworkPolicy lo deja colgado: timeout, ni siquiera handshake."
- **ESPERADO:** TIMEOUT / `connection timed out` (sin `succeeded`). El comando NO conecta. ESTO ES LO ESPERADO.

### Paso 6 — rogue → Redis (debe FALLAR)
- **DONDE:** Terminal (master)
- **ACCION:** Mismo intento contra Redis.
```bash
kubectl exec rogue -- nc -zv -w 5 redis.micrositio.svc.cluster.local 6379
```
- **NARRACION:** "Lo mismo con Redis: bloqueado. Zero-trust por defecto."
- **ESPERADO:** TIMEOUT / connection refused, sin `succeeded`. Bloqueado (esperado).

---

## PARTE C — Pod CONTROL (autorizado) → SI conecta

### Paso 7 — Lanzar pod de prueba CON label `app=api` dentro de `micrositio`
- **DONDE:** Terminal (master)
- **ACCION:** Crear un pod identico pero etiquetado y en el namespace correcto.
```bash
kubectl delete pod test-allowed -n micrositio --ignore-not-found --grace-period=0 --force
kubectl run test-allowed --image=nicolaka/netshoot --restart=Never -n micrositio --labels="app=api" --command -- sleep 120
kubectl wait --for=condition=Ready pod/test-allowed -n micrositio --timeout=60s
```
- **NARRACION:** "Ahora un pod legitimo: mismo imagen, pero con label app=api y dentro del namespace, autorizado por allow-api-to-mongo."
- **ESPERADO:** `pod/test-allowed created` y luego `condition met`.

### Paso 8 — test-allowed → MongoDB (debe CONECTAR)
- **DONDE:** Terminal (master)
- **ACCION:** Abrir socket a Mongo desde el pod autorizado.
```bash
kubectl exec test-allowed -n micrositio -- nc -zv -w 5 mongodb-0.mongodb-headless.micrositio.svc.cluster.local 27017
```
- **NARRACION:** "Este SI entra: la etiqueta app=api esta en la allowlist de allow-api-to-mongo. La unica diferencia con el rogue es el label."
- **ESPERADO:** `... 27017 open` / `Connection ... succeeded!`. AUTORIZADO.

---

## PARTE D — (Opcional, visual) Confirmar que la app sigue viva

### Paso 9 — Abrir la tienda en el navegador
- **DONDE:** Navegador
- **ACCION:** Mostrar que el trafico legitimo del ingress a la API sigue funcionando pese al default-deny.
```text
https://zuyu.local/demo
```
- **NARRACION:** "Mientras tanto la tienda real sigue online: las policies permiten el camino ingress→api→mongo, solo cortan lo no declarado."
- **ESPERADO:** Carga la tienda del negocio `demo` sin errores.

---

## LIMPIEZA (Terminal — master)

### Paso 10 — Borrar los pods de la demo
- **DONDE:** Terminal (master)
- **ACCION:** Eliminar rogue y test-allowed.
```bash
kubectl delete pod rogue --grace-period=0 --force
kubectl delete pod test-allowed -n micrositio --grace-period=0 --force --ignore-not-found
```
- **NARRACION:** "Limpio los pods de prueba; el cluster queda como estaba."
- **ESPERADO:** `pod "rogue" deleted` (y test-allowed si seguia).

---

## CIERRE
**Decir al profe:** "Calico hace zero-trust pod-a-pod. La unica diferencia entre el pod bloqueado y el autorizado fue una etiqueta: sin policy explicita, no hay acceso."


**🎯 Frase de cierre:** _Calico hace zero-trust pod-a-pod: sin una etiqueta explícitamente permitida, un pod nuevo no puede ni siquiera abrir socket contra Mongo o Redis._


---

# RUNBOOK MANUAL — DEMO 4: KEDA escala el worker por la cola (15 pts KEDA)

> **Idea en 1 frase:** KEDA mira cuántos jobs hay en la cola de Redis (`bull:notificaciones:wait`). Si crece, escala el Deployment `worker` de 1→5 réplicas vía un HPA; cuando se vacía, lo regresa a 1.
>
> **Por qué carga SOSTENIDA:** los jobs de prueba se procesan casi instantáneo, así que un push único se drena antes de que KEDA reaccione. Hay que mantener la cola llena empujando en bucle desde otra terminal.
>
> **Pre-requisitos:** estar en la **Terminal (master)** con `kubectl` listo, y tener dos pestañas de terminal a mano (una para empujar carga, otra para observar).

---

## SETUP (Terminal master) — hazlo ANTES de empezar

### Paso 0.1 — Resolver IP del ingress (la del script, 10.211.55.37, está MUERTA)
- **DONDE:** Terminal (master)
- **ACCION:** Obtener la IP real del nodo donde corre el ingress-nginx (para los curl con `--resolve`).
```bash
IP=$(kubectl get pod -n ingress-nginx -l app.kubernetes.io/component=controller -o jsonpath='{.items[0].status.hostIP}'); echo $IP
```
- **NARRACION:** "Resuelvo la IP viva del ingress en una variable; no uso IPs hardcodeadas."
- **ESPERADO:** Imprime una IP, p. ej. `10.211.55.38` (NO vacío).

### Paso 0.2 — Sacar el password de Redis a una variable (sin exponerlo)
- **DONDE:** Terminal (master)
- **ACCION:** Cargar `REDIS_PASSWORD` en `RPW` para los comandos `redis-cli`.
```bash
RPW=$(kubectl get secret redis-auth -n micrositio -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d)
```
- **NARRACION:** "El password de Redis lo leo del Secret a una variable; nunca lo escribo en claro."
- **ESPERADO:** Sin salida (variable cargada). No imprimas `$RPW`.

### Paso 0.3 — Fijar el nombre de la cola en una variable
- **DONDE:** Terminal (master)
- **ACCION:** Definir la cola que KEDA observa (lista de espera de BullMQ).
```bash
QUEUE=bull:notificaciones:wait
```
- **NARRACION:** "Esta es la cola de notificaciones de BullMQ que KEDA usa como métrica."
- **ESPERADO:** Sin salida.

---

## PARTE A — ESTADO INICIAL

### Paso 1 — Asegurar que el ScaledObject NO esté pausado
- **DONDE:** Terminal (master)
- **ACCION:** Quitar la anotación de pausa por si quedó de una prueba anterior (idempotente).
```bash
kubectl annotate scaledobject worker-scaler -n micrositio autoscaling.keda.sh/paused-replicas- --overwrite
```
- **NARRACION:** "Me aseguro de que KEDA esté activo y no pausado antes de empezar."
- **ESPERADO:** `scaledobject.keda.sh/worker-scaler annotated` (o sin error si no estaba pausado).

### Paso 2 — Mostrar el ScaledObject, el HPA y el worker en 1 réplica
- **DONDE:** Terminal (master)
- **ACCION:** Ver el estado de reposo: KEDA listo, HPA en mínimos, worker en 1.
```bash
kubectl get scaledobject worker-scaler -n micrositio
kubectl get hpa keda-hpa-worker-scaler -n micrositio
kubectl get deploy worker -n micrositio
```
- **NARRACION:** "En reposo: el ScaledObject está READY, el HPA en su mínimo y el worker corre con 1 sola réplica."
- **ESPERADO:** ScaledObject `READY=True ACTIVE=False PAUSED=False MIN=1 MAX=5`; HPA `MINPODS=1 MAXPODS=5 REPLICAS=1`; deploy `worker 1/1`.

---

## PARTE B — GENERAR CARGA Y VER EL SCALE-UP (1 → 5)

### Paso 3 — (Pestaña/terminal 2) Generar carga SOSTENIDA en bucle
- **DONDE:** Terminal (master) — **segunda pestaña** (déjala corriendo). Repite `RPW` y `QUEUE` aquí si abriste pestaña nueva (Pasos 0.2 y 0.3).
- **ACCION:** Empujar 20.000 jobs cada 5s, server-side con un script Lua, hasta que tú la pares.
```bash
for r in $(seq 1 30); do
  kubectl exec deploy/redis -n micrositio -- redis-cli -a "$RPW" --no-auth-warning \
    EVAL 'for i=1,20000 do redis.call("RPUSH", KEYS[1], "j"..i) end return 1' 1 "$QUEUE" >/dev/null 2>&1
  echo "  push #$r enviado ($(date +%T))"
  sleep 5
done
```
- **NARRACION:** "Empujo carga sostenida más rápido de lo que el worker drena, para mantener la cola llena mientras KEDA reacciona."
- **ESPERADO:** Cada ~5s imprime `push #N enviado ...`. **Déjala corriendo** y vuelve a la pestaña 1.

### Paso 4 — (Pestaña 1) Observar el SCALE-UP en vivo
- **DONDE:** Terminal (master) — pestaña 1
- **ACCION:** Ver crecer réplicas y `desired` del HPA mientras la cola está alta (refresca cada 5s).
```bash
watch -n5 'kubectl get deploy worker -n micrositio; echo "---HPA---"; kubectl get hpa keda-hpa-worker-scaler -n micrositio'
```
- **NARRACION:** "KEDA detecta la cola llena, marca el ScaledObject ACTIVE y empuja el HPA: el worker empieza a escalar."
- **ESPERADO:** En 30–90s, `worker` pasa de `1/1` → `3/3` → hasta `5/5`; HPA `REPLICAS` sube hacia 5 y `desired` también. (Sal de `watch` con `Ctrl-C` cuando llegues a 4–5 réplicas.)

### Paso 4-alt (opcional) — Confirmar la longitud de la cola que ve KEDA
- **DONDE:** Terminal (master) — pestaña 1
- **ACCION:** Ver cuántos jobs hay esperando (la métrica de KEDA).
```bash
kubectl exec deploy/redis -n micrositio -- redis-cli -a "$RPW" --no-auth-warning LLEN "$QUEUE"
```
- **NARRACION:** "Esta es exactamente la métrica que KEDA consulta: la longitud de la cola."
- **ESPERADO:** Un número alto (decenas de miles) durante la carga.

### Paso 5 — Ver los pods worker escalados
- **DONDE:** Terminal (master) — pestaña 1
- **ACCION:** Mostrar los 5 pods worker repartidos en los nodos.
```bash
kubectl get pods -n micrositio -l app=worker -o wide
```
- **NARRACION:** "Aquí están las réplicas nuevas del worker drenando la cola en paralelo."
- **ESPERADO:** ~5 pods `worker-...` en `Running` (varios recién creados, columna AGE baja).

---

## PARTE C — DETENER CARGA Y VER EL SCALE-DOWN (5 → 1)

### Paso 6 — Detener la carga sostenida
- **DONDE:** Terminal (master) — **pestaña 2** (la del bucle del Paso 3)
- **ACCION:** Cortar el bucle de push para que la cola deje de crecer.
```text
Ctrl-C   (en la pestaña que corre el for/push)
```
- **NARRACION:** "Corto la carga; ahora el worker drena lo que queda sin que entre nada nuevo."
- **ESPERADO:** El bucle se detiene; deja de imprimir `push #N`.

### Paso 7 — Observar el SCALE-DOWN en vivo
- **DONDE:** Terminal (master) — pestaña 1
- **ACCION:** Ver caer la cola a 0 y las réplicas volver a 1 (paciencia: KEDA aplica cooldown).
```bash
watch -n5 'kubectl get deploy worker -n micrositio; echo "---QUEUE---"; kubectl exec deploy/redis -n micrositio -- redis-cli -a "'"$RPW"'" --no-auth-warning LLEN bull:notificaciones:wait'
```
- **NARRACION:** "Los 5 workers vacían la cola; al quedar en 0 y pasar el cooldown, KEDA baja solo el worker de vuelta a 1."
- **ESPERADO:** `QUEUE` baja hasta `0`; en 2–4 min `worker` regresa a `1/1`. (`Ctrl-C` para salir de `watch`.)

### Paso 8 — Confirmar estado final igual al inicial
- **DONDE:** Terminal (master) — pestaña 1
- **ACCION:** Verificar que el sistema volvió al reposo.
```bash
kubectl get scaledobject worker-scaler -n micrositio
kubectl get deploy worker -n micrositio
```
- **NARRACION:** "Volvimos al estado inicial: ScaledObject ACTIVE=False y worker en 1 réplica, sin tocar nada a mano."
- **ESPERADO:** ScaledObject `ACTIVE=False`; deploy `worker 1/1`.

---

## (OPCIONAL) Refuerzo VISUAL en el navegador
Si quieres mostrarlo gráficamente mientras escala, usa el navegador (el `/etc/hosts` del Mac resuelve `zuyu.local`):

- **DONDE:** Navegador
- **ACCION:** Abrir Grafana y mirar el panel de réplicas del worker / longitud de cola subir y bajar.
```text
https://zuyu.local/grafana/
```
- **NARRACION:** "En Grafana se ve la curva: la cola sube, las réplicas suben detrás, y ambas vuelven a su base."
- **ESPERADO:** El gráfico de réplicas del `worker` salta de 1 a 5 y luego regresa a 1.

---

## CIERRE
- **DI:** "KEDA escala el worker 1→5 con la cola llena, y lo baja a 1 al drenar — autoescalado dirigido por eventos, sin intervención manual."

---

### Notas de seguridad / correcciones aplicadas
- La IP `10.211.55.37` del script está **muerta**; se usa `$IP` resuelto en el Paso 0.1 (en este cluster dio `10.211.55.38`). Para curl al ingress se usaría `--resolve zuyu.local:443:$IP`, aunque esta demo es 100% `kubectl` y no necesita curl.
- El password de Redis sale por **variable `$RPW`** desde el Secret `redis-auth/REDIS_PASSWORD`; nunca se imprime.
- En el script original el push y el monitoreo corren en background con `&`; **a mano** se hace en **dos pestañas** (una empuja, otra observa) y se corta con `Ctrl-C`, que es más claro en vivo.
- Recursos confirmados en el cluster: ns `micrositio`, ScaledObject `worker-scaler` (MIN 1 / MAX 5, READY), HPA `keda-hpa-worker-scaler`, deploy `worker`, deploy `redis`, Secret `redis-auth`.

**🎯 Frase de cierre:** _"KEDA observa la longitud de la cola Redis: con carga sostenida dispara el HPA y escala el worker de 1 a 5, y cuando la cola se drena baja solo de vuelta a 1."_


---

# RUNBOOK MANUAL - DEMO 5: CI/CD (git push -> Tekton -> ArgoCD -> deploy)

**Puntos:** 15 (CI/CD) - **Duracion:** 5-7 min

> Flujo que demuestras: `git push` (GitHub) -> EventListener Tekton dispara `PipelineRun` -> Kaniko buildea y pushea la imagen al registry interno (NodePort 30500) -> ArgoCD detecta el cambio y sincroniza -> el rollout **canary** de `api` despliega pods nuevos. Todo automatico.
>
> **NOTA**: la IP `10.211.55.37`/`10.211.55.30:30500` del script viejo ya no es la del ingress. El ingress ahora vive en un worker; lo resolvemos con `$IP`. El registry sigue accesible por el master `10.211.55.30:30500`.

---

## SETUP (Terminal master) - hazlo antes de empezar

### Paso 0 - Cargar la IP del ingress en una variable
- **DONDE:** Terminal (master)
- **ACCION:** Detecta automaticamente el nodo donde corre el ingress-nginx.
- **COMANDO:**
```bash
IP=$(kubectl get pod -n ingress-nginx -l app.kubernetes.io/component=controller -o jsonpath='{.items[0].status.hostIP}'); echo $IP
```
- **NARRACION:** "Primero ubico el nodo del ingress; con esto todos los curl resuelven al sitio real."
- **ESPERADO:** imprime una IP, p.ej. `10.211.55.38`.

---

## DEMO EN VIVO

### Paso 1 - Mostrar el estado ACTUAL de ArgoCD (punto de partida)
- **DONDE:** Navegador
- **ACCION:** Abre ArgoCD y muestra la app `micrositio` en verde (Synced / Healthy).
- **URL:**
```
https://argocd.zuyu.local/applications/micrositio
```
- **NARRACION:** "Aqui esta mi aplicacion gestionada por ArgoCD: ahora mismo Synced y Healthy. Voy a provocar un cambio con un solo commit."
- **ESPERADO:** tarjeta `micrositio` con badges verdes **Synced** y **Healthy**; arbol de recursos (rollout `api`, deploy `worker`, `redis`).

> Si ArgoCD pide login: usuario `admin`. La contrasena la sacas (sin exponerla) con:
> ```bash
> kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath='{.data.password}' | base64 -d; echo
> ```

### Paso 2 - Hacer un cambio trivial y trazable en el codigo
- **DONDE:** Terminal (master)
- **ACCION:** Inserta/actualiza un marcador con la hora en `api/api.js` (idempotente, no acumula lineas).
- **COMANDO:**
```bash
cd /Users/emiliocontreras/Downloads/Proyectos/micrositio-pedidos
TS=$(date +%H%M%S)
grep -q "// ci-demo-marker:" api/api.js \
  && sed -i.bak "s|// ci-demo-marker:.*|// ci-demo-marker: $TS|" api/api.js \
  || printf '\n// ci-demo-marker: %s\n' "$TS" >> api/api.js
rm -f api/api.js.bak
echo "marcador = $TS"; git --no-pager diff api/api.js
```
- **NARRACION:** "Hago un cambio minimo pero real en el codigo de la API: un marcador con la hora, para poder rastrear este commit hasta el pod desplegado."
- **ESPERADO:** el `diff` muestra la linea `// ci-demo-marker: <hora>`.

### Paso 3 - commit + push a GitHub (esto es lo que dispara TODO)
- **DONDE:** Terminal (master)
- **ACCION:** Commit y push a `main`; el push es el unico gatillo manual de toda la cadena.
- **COMANDO:**
```bash
git add api/api.js
git commit -m "ci: trigger demo build $TS"
git push origin main
```
- **NARRACION:** "Hago git push a main. A partir de aqui no toco nada mas: el webhook de GitHub avisa a Tekton."
- **ESPERADO:** `git push` termina con `-> main` y la nueva referencia subida a `github.com/SEBASTIANCONTRERAS35/micrositio-pedidos`.

### Paso 4 - Confirmar que el EventListener disparo un PipelineRun automatico
- **DONDE:** Terminal (master)
- **ACCION:** Verifica que el webhook creo un `PipelineRun` nuevo (los auto-creados llevan prefijo `micrositio-build-auto-`).
- **COMANDO:**
```bash
kubectl get eventlistener micrositio-github-listener -n ci
sleep 8
kubectl get pipelinerun -n ci --sort-by=.metadata.creationTimestamp | tail -3
PR=$(kubectl get pipelinerun -n ci --sort-by=.metadata.creationTimestamp -o name | tail -1); echo "Ultimo PipelineRun: $PR"
```
- **NARRACION:** "El EventListener recibio el push y ya creo un PipelineRun nuevo, sin que yo lo lanzara a mano."
- **ESPERADO:** aparece un `micrositio-build-auto-xxxxx` recien creado (AGE en segundos) en estado `Running`/`Unknown`.

> **Plan B si el webhook no llega** (red/tunel): lanzas el PipelineRun a mano, mismo pipeline (`micrositio-build`):
> ```bash
> TS=$(date +%H%M%S)
> kubectl create -f - <<EOF
> apiVersion: tekton.dev/v1
> kind: PipelineRun
> metadata: { generateName: demo-build-, namespace: ci }
> spec:
>   pipelineRef: { name: micrositio-build }
>   params:
>   - { name: image-api,    value: 10.211.55.30:30500/micrositio-api:demo-$TS }
>   - { name: image-worker, value: 10.211.55.30:30500/micrositio-worker:demo-$TS }
>   workspaces:
>   - name: source
>     volumeClaimTemplate:
>       spec: { accessModes: [ReadWriteOnce], storageClassName: nfs-csi, resources: { requests: { storage: 3Gi } } }
> EOF
> ```
> Di: "En produccion lo dispara el webhook; aqui lo creo manual con el MISMO pipeline para no esperar a la red."

### Paso 5 - Ver el pipeline corriendo en vivo (clone -> kaniko api -> kaniko worker)
- **DONDE:** Terminal (master)
- **ACCION:** Sigue los TaskRuns/pasos del PipelineRun y su condicion `Succeeded`.
- **COMANDO:**
```bash
PRN=$(kubectl get pipelinerun -n ci --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1].metadata.name}')
kubectl get taskrun -n ci -l tekton.dev/pipelineRun=$PRN
watch -n5 "kubectl get pipelinerun $PRN -n ci -o jsonpath='{.status.conditions[0].reason}'; echo"
```
- **NARRACION:** "El pipeline clona el repo, buildea la imagen de la API con Kaniko y luego la del worker, y al final la pushea al registry interno."
- **ESPERADO:** la razon pasa de `Running` a **`Succeeded`** (toma ~2 min). Sal del `watch` con `Ctrl-C` cuando diga Succeeded.

### Paso 6 - Comprobar que la imagen quedo en el registry interno
- **DONDE:** Terminal (master)
- **ACCION:** Lista los tags publicados en el registry (NodePort 30500 via master).
- **COMANDO:**
```bash
curl -s http://10.211.55.30:30500/v2/micrositio-api/tags/list | python3 -m json.tool
```
- **NARRACION:** "La imagen recien construida ya esta en mi registry privado dentro del cluster; aqui veo los tags."
- **ESPERADO:** JSON con `"name":"micrositio-api"` y la lista de `tags` (incluye `latest` y/o `demo-<hora>`).

### Paso 7 - Forzar a ArgoCD a detectar el cambio y sincronizar
- **DONDE:** Terminal (master)
- **ACCION:** Refresca la app para que ArgoCD compare con git y sincronice el manifiesto nuevo.
- **COMANDO:**
```bash
kubectl patch app micrositio -n argocd --type=merge \
  -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"normal"}}}'
sleep 10
kubectl get app micrositio -n argocd \
  -o jsonpath='Sync={.status.sync.status} / Health={.status.health.status} / Rev={.status.sync.revision}{"\n"}'
```
- **NARRACION:** "ArgoCD revisa el estado deseado en git y, al ver el cambio, lo aplica al cluster automaticamente."
- **ESPERADO:** `Sync=Synced / Health=Healthy / Rev=<hash del commit nuevo>`.

### Paso 8 - Mostrar el deploy real: el rollout canary de la API
- **DONDE:** Terminal (master)
- **ACCION:** Muestra el rollout `api` desplegando la nueva ReplicaSet con estrategia canary.
- **COMANDO:**
```bash
kubectl argo rollouts get rollout api -n micrositio
```
- **NARRACION:** "El despliegue no es un swap brusco: es un rollout canary que va subiendo el peso al 100% solo si las pruebas pasan."
- **ESPERADO:** `Strategy: Canary`, `Status: Healthy`, una ReplicaSet `stable` con pods `Running ready:1/1`, peso 100%.

### Paso 9 - Cierre visual en ArgoCD (navegador)
- **DONDE:** Navegador
- **ACCION:** Vuelve a ArgoCD y muestra que sincronizo al nuevo commit y todo sigue verde.
- **URL:**
```
https://argocd.zuyu.local/applications/micrositio
```
- **NARRACION:** "Y aqui esta el ciclo completo cerrado: ArgoCD apuntando a mi ultimo commit, app Synced y Healthy, pods nuevos arriba."
- **ESPERADO:** la app muestra el nuevo `Revision`/commit, badges verdes Synced/Healthy y los pods `api-*` recientes.

### Paso 10 (opcional) - Probar que la tienda sigue viva tras el deploy
- **DONDE:** Navegador
- **ACCION:** Abre la tienda demo para confirmar que el servicio responde con la version nueva.
- **URL:**
```
https://zuyu.local/
```
- **NARRACION:** "Y el usuario final no nota nada: la tienda sigue respondiendo, ya con la imagen recien construida."
- **ESPERADO:** carga la tienda demo (negocio slug `demo`) sin errores. (Para verificar por terminal: `curl -sk --resolve zuyu.local:443:$IP https://zuyu.local/healthz`).

---

## CIERRE (frase para el profe)
> "git push -> Tekton clona y buildea con Kaniko -> registry interno -> ArgoCD detecta y sincroniza -> rollout canary despliega los pods nuevos. **Un solo push y todo se desplego solo, sin intervencion manual.**"

---

## CHEAT-SHEET (recuperacion rapida)
| Que | Comando |
|---|---|
| IP ingress | `IP=$(kubectl get pod -n ingress-nginx -l app.kubernetes.io/component=controller -o jsonpath='{.items[0].status.hostIP}'); echo $IP` |
| Ultimo PipelineRun | `kubectl get pipelinerun -n ci --sort-by=.metadata.creationTimestamp \| tail -3` |
| Estado build | `kubectl get pipelinerun <name> -n ci -o jsonpath='{.status.conditions[0].reason}'` |
| Logs build | `kubectl logs -n ci -l tekton.dev/pipelineRun=<name> --tail=40 -f` |
| Tags registry | `curl -s http://10.211.55.30:30500/v2/micrositio-api/tags/list \| python3 -m json.tool` |
| Refresh ArgoCD | `kubectl patch app micrositio -n argocd --type=merge -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"normal"}}}'` |
| Estado ArgoCD | `kubectl get app micrositio -n argocd -o jsonpath='Sync={.status.sync.status}/Health={.status.health.status}'` |
| Rollout api | `kubectl argo rollouts get rollout api -n micrositio` |
| Pass ArgoCD | `kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath='{.data.password}' \| base64 -d; echo` |


**🎯 Frase de cierre:** _"Un solo git push dispara toda la cadena: Tekton clona y buildea con Kaniko y pushea al registry interno, ArgoCD detecta el cambio y sincroniza, y el rollout canary despliega los pods nuevos sin que yo toque nada."_


---

# RUNBOOK MANUAL — Demo 6: Argo Rollouts Canary 10→50→100 con análisis

> Pega los comandos uno por uno. NO ejecutes el `.sh`. La IP `10.211.55.37` del script está MUERTA: aquí se resuelve sola con `$IP`.

---

## SETUP (Terminal master) — hazlo antes de empezar

### Paso 0 — Resolver la IP viva del ingress
- **DONDE:** Terminal (master)
- **ACCION:** Captura la IP real del nodo del ingress-nginx en la variable `$IP`.
```bash
IP=$(kubectl get pod -n ingress-nginx -l app.kubernetes.io/component=controller -o jsonpath='{.items[0].status.hostIP}'); echo $IP
```
- **NARRACION:** "Primero capturo la IP del ingress en una variable, así no dependo de IPs quemadas."
- **ESPERADO:** Imprime una IP, p.ej. `10.211.55.38` (NO la 10.211.55.37 del script).

---

## DEMO EN VIVO

### Paso 1 — Estado inicial del Rollout (estable en :latest)
- **DONDE:** Terminal (master)
- **ACCION:** Muestra el Rollout `api` sano, al 100% en la imagen estable.
```bash
kubectl-argo-rollouts get rollout api -n micrositio --no-color | head -15
```
- **NARRACION:** "Este es mi Rollout actual: estrategia Canary, sano, al 100% sobre el tag :latest."
- **ESPERADO:** `Status: ✔ Healthy`, `Strategy: Canary`, `Step: 5/5`, `SetWeight: 100`, imagen `...micrositio-api:latest (stable)`.

### Paso 2 — Confirmar la estrategia canary (los pasos 10→50→100)
- **DONDE:** Terminal (master)
- **ACCION:** Imprime los steps definidos para evidenciar el plan de promoción.
```bash
kubectl get rollout api -n micrositio -o jsonpath='{.spec.strategy.canary.steps}'; echo
```
- **NARRACION:** "El plan de canary está declarado: 10%, pausa, 50%, pausa, 100%."
- **ESPERADO:** `[{"setWeight":10},{"pause":{"duration":"2m"}},{"setWeight":50},{"pause":{"duration":"2m"}},{"setWeight":100}]`

### Paso 3 — Crear tag :v2 desde :latest en el registry (mismo binario, distinto tag)
- **DONDE:** Terminal (master)
- **ACCION:** Re-etiqueta el manifest de `:latest` con un tag nuevo para que el Rollout vea un cambio.
```bash
TAG="v$(date +%s | tail -c 5)"; NEW_IMAGE="10.211.55.30:30500/micrositio-api:$TAG"
MANIFEST=$(curl -s -H "Accept: application/vnd.oci.image.manifest.v1+json" http://10.211.55.30:30500/v2/micrositio-api/manifests/latest)
curl -s -X PUT -H "Content-Type: application/vnd.oci.image.manifest.v1+json" -d "$MANIFEST" http://10.211.55.30:30500/v2/micrositio-api/manifests/$TAG > /dev/null
echo "Nueva imagen: $NEW_IMAGE"
```
- **NARRACION:** "Creo un tag nuevo apuntando al mismo binario; para el Rollout es una versión distinta y dispara el canary."
- **ESPERADO:** `Nueva imagen: 10.211.55.30:30500/micrositio-api:vXXXX` (sin errores del curl).

### Paso 4 — Abrir el watch del Rollout en VIVO (déjalo corriendo)
- **DONDE:** Terminal (master) — idealmente una segunda pestaña
- **ACCION:** Vista en tiempo real del avance del canary.
```bash
kubectl-argo-rollouts get rollout api -n micrositio --watch
```
- **NARRACION:** "Dejo este watch abierto para ver el canary avanzar paso a paso."
- **ESPERADO:** Pantalla que se actualiza sola con `Step`, `SetWeight`, `ActualWeight` y los pods canary/stable. (Para parar el watch: `Ctrl+C`.)

### Paso 5 — Disparar el Rollout con la nueva imagen
- **DONDE:** Terminal (master) — en la pestaña principal
- **ACCION:** Cambia la imagen del Rollout, lo que inicia el canary al 10%.
```bash
kubectl-argo-rollouts set image api api=$NEW_IMAGE -n micrositio
```
- **NARRACION:** "Disparo el deploy de la versión nueva: arranca con solo el 10% del tráfico."
- **ESPERADO:** `image updated`. En el watch aparece un ReplicaSet canary nuevo, `SetWeight: 10`, estado `Paused` (pausa de 2 min) y el AnalysisRun `api-error-rate` corriendo.

### Paso 6 — Verificar que está en el step 10%
- **DONDE:** Terminal (master)
- **ACCION:** Confirma el peso actual del canary.
```bash
kubectl-argo-rollouts get rollout api -n micrositio --no-color | head -25
```
- **NARRACION:** "Ya tengo el 10% en la versión nueva; el resto sigue en la estable, sin downtime."
- **ESPERADO:** `Status: ॥ Paused`, `Step: 1/5`, `SetWeight: 10`, dos imágenes listadas: `:latest (stable)` y `:vXXXX (canary)`.

### Paso 7 — (Navegador) Ver el canary en ArgoCD
- **DONDE:** Navegador
- **ACCION:** Abre ArgoCD para mostrar el árbol del app con el Rollout en progreso.
```text
https://argocd.zuyu.local
```
- **NARRACION:** "En ArgoCD veo el mismo canary de forma visual, con los dos ReplicaSets conviviendo."
- **ESPERADO:** App `micrositio` Healthy/Progressing; el recurso Rollout `api` muestra pods stable + canary.

### Paso 8 — Promover manualmente al 50% (skip de la pausa de 2 min)
- **DONDE:** Terminal (master)
- **ACCION:** Salta la espera y avanza al siguiente peso.
```bash
kubectl-argo-rollouts promote api -n micrositio
```
- **NARRACION:** "El análisis del 10% pasó, así que promuevo al 50% sin esperar la pausa."
- **ESPERADO:** En el watch: `SetWeight: 50`, `Step: 3/5`; sube el número de pods canary.

### Paso 9 — Promover al 100% (completa el rollout)
- **DONDE:** Terminal (master)
- **ACCION:** Promueve al peso final; la versión nueva pasa a ser estable.
```bash
kubectl-argo-rollouts promote api -n micrositio
```
- **NARRACION:** "Todo verde: promuevo al 100% y la nueva versión se vuelve la estable."
- **ESPERADO:** `Status: ✔ Healthy`, `Step: 5/5`, `SetWeight: 100`, imagen `:vXXXX (stable)`. El ReplicaSet viejo se escala a 0.

### Paso 10 — Probar que HTTPS estuvo en 200 todo el tiempo
- **DONDE:** Terminal (master)
- **ACCION:** Hace un curl al ingress usando `$IP` (la IP viva) en lugar de la muerta.
```bash
curl -ks --resolve zuyu.local:443:$IP -o /dev/null -w "  zuyu.local: HTTP %{http_code} en %{time_total}s\n" https://zuyu.local/health/live
```
- **NARRACION:** "Y durante todo el rollout el servicio nunca dejó de responder 200: cero downtime."
- **ESPERADO:** `zuyu.local: HTTP 200 en 0.0Xs`.

### Paso 11 — (Navegador) Confirmar la tienda viva
- **DONDE:** Navegador
- **ACCION:** Abre la tienda demo para mostrar el resultado de cara al usuario.
```text
https://zuyu.local/demo
```
- **NARRACION:** "Y la tienda del negocio 'demo' sigue funcionando con la versión recién promovida."
- **ESPERADO:** Carga el micrositio del slug `demo` sin errores. (Panel opcional: `https://zuyu.local/panel/login` con `demo@zuyu.local` / `Demo1234!`.)

---

## EXTRA OPCIONAL — Abort + rollback (si el profe lo pide)
> Solo si vuelves a disparar un canary y quieres mostrar el auto-rollback.

### Abortar manualmente
- **DONDE:** Terminal (master)
- **ACCION:** Aborta el canary en curso y vuelve a la versión estable al instante.
```bash
kubectl-argo-rollouts abort api -n micrositio
```
- **NARRACION:** "Si veo algo raro, aborto y vuelvo a la estable en segundos — y el AnalysisTemplate api-error-rate hace exactamente esto solo si el error rate se dispara."
- **ESPERADO:** `Status: ✖ Degraded/Aborted`; el canary se escala a 0 y queda 100% en `:latest` estable.

### Ver el AnalysisTemplate que automatiza el abort
- **DONDE:** Terminal (master)
- **ACCION:** Muestra el template que vigila el error rate.
```bash
kubectl get analysistemplate api-error-rate -n micrositio
```
- **NARRACION:** "Este es el guardián automático: mide error rate por paso y aborta sin que yo toque nada."
- **ESPERADO:** Lista `api-error-rate` con su AGE.

---

## NOTAS PARA EL PRESENTADOR
- La IP `10.211.55.37` del script original está **muerta**; este runbook usa `$IP` (Paso 0) que resolvió a `10.211.55.38` al verificar.
- El registry vive en `10.211.55.30:30500` (HTTP plano, en cluster) — los curl de re-tag van directo ahí.
- El dashboard nativo de Argo Rollouts NO está expuesto por ingress; usa el `--watch` (Paso 4) y/o ArgoCD (Paso 7) para lo visual.
- Si no quieres saltar pausas, cada step espera 2 min solo; `promote` (Pasos 8-9) acelera la demo.
- Tag generado es efímero (`vXXXX`); no contamina nada permanente — es el mismo binario que `:latest`.

**🎯 Frase de cierre:** _"Canary release sin downtime: despliego v2 al 10%, promuevo a 50% y 100% mientras HTTPS sigue en 200 — y si el AnalysisTemplate detecta error rate alto, aborta y revierte solo."_


---

# RUNBOOK MANUAL — Demo 7: Seguir un pedidoId en Loki/Grafana

> Objetivo: demostrar que cada log de la API sale como JSON con un campo `pedidoId`, Grafana Alloy lo recolecta y lo manda a Loki, y desde Grafana (o por CLI) puedo recuperar toda la historia de un pedido en segundos.
>
> **IMPORTANTE (correccion vs. el script):** En este cluster `pedidoId` **NO es un label de Loki** (los labels reales son `app`, `namespace`, `pod`, `level`, etc.). El `pedidoId` viaja **dentro del JSON de la linea de log**. Por eso la query correcta usa un **filtro de linea** `|= "PED-..."` o el **parser** `| json | pedidoId="PED-..."`, **no** un selector de label `{pedidoId="..."}`. La IP `10.211.55.37` del script esta muerta; se usa la IP real del ingress via variable.

---

## SETUP (Terminal master) — antes de empezar

### Paso 0a — Obtener la IP real del ingress
- **DONDE:** Terminal (master)
- **ACCION:** Calcular la IP del nodo donde corre el ingress (la del script esta muerta).
- **COMANDO:**
```bash
IP=$(kubectl get pod -n ingress-nginx -l app.kubernetes.io/component=controller -o jsonpath='{.items[0].status.hostIP}'); echo $IP
```
- **NARRACION:** "Primero saco la IP real del ingress, porque la voy a usar para entrar a la API por su nombre de dominio."
- **ESPERADO:** Una IP tipo `10.211.55.38` impresa en pantalla.

### Paso 0b — Sacar el password de la app (sin exponerlo) y el ID de producto real
- **DONDE:** Terminal (master)
- **ACCION:** Guardar el password de la app en variable y obtener un `productoId` real del negocio demo (IDs inventados dan 400 en validacion).
- **COMANDO:**
```bash
APP_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.APP_PASSWORD}' | base64 -d)
PROD_ID=$(kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio \
  --eval 'const n=db.negocios.findOne({slug:"demo"}); print(db.productos.findOne({negocioId:n._id})._id.toString())' \
  2>/dev/null | tail -1 | tr -dc 'a-f0-9'); echo "PROD_ID=$PROD_ID"
```
- **NARRACION:** "El password lo leo del Secret a una variable, nunca lo escribo a mano, y tomo un producto real del negocio demo."
- **ESPERADO:** `PROD_ID=` seguido de 24 caracteres hex (ej. `6a08d5...`).

---

## PASO 1 — Generar pedidos para tener data en Loki

- **DONDE:** Terminal (master)
- **ACCION:** Crear 3 pedidos contra la API a traves del ingress (resolviendo `zuyu.local` a la IP real).
- **COMANDO:**
```bash
for i in 1 2 3; do
  curl -k --resolve zuyu.local:443:$IP -s -X POST https://zuyu.local/api/pedidos \
    -H "Content-Type: application/json" \
    -d "{
      \"negocioSlug\":\"demo\",
      \"cliente\":{\"nombre\":\"Cliente $i\",\"telefono\":\"+52555555010$i\",\"email\":\"cliente$i@x.mx\",\"direccion\":\"Calle $i 100, CDMX\"},
      \"productos\":[{\"id\":\"$PROD_ID\",\"cantidad\":1}],
      \"metodoPago\":\"efectivo\"
    }" -o /dev/null -w "  Pedido $i: HTTP %{http_code}\n"
done
```
- **NARRACION:** "Lanzo tres pedidos a la API; cada uno va a generar logs con su propio pedidoId."
- **ESPERADO:** Tres lineas `Pedido 1/2/3: HTTP 201` (creado). Si vieras 400 revisa el `PROD_ID`.

---

## PASO 2 — Dar tiempo a que Alloy recolecte y Loki indexe

- **DONDE:** Terminal (master)
- **ACCION:** Esperar ~10 segundos a que Alloy empuje los logs a Loki.
- **COMANDO:**
```bash
sleep 10
```
- **NARRACION:** "Le doy unos segundos a Alloy para que recoja esos logs y los mande a Loki."
- **ESPERADO:** El prompt regresa tras 10 segundos (sin salida).

---

## PASO 3 — Abrir Grafana en el navegador

- **DONDE:** Navegador
- **ACCION:** Abrir Grafana en la vista Explore (el `/etc/hosts` del Mac resuelve `grafana.zuyu.local`).
- **URL:**
```
https://grafana.zuyu.local/explore
```
- **NARRACION:** "Entro a Grafana, a la vista Explore, que es donde consulto Loki en vivo."
- **ESPERADO:** Carga Grafana; si pide login redirige a la pantalla de acceso (HTTP 302 -> login).

### (Si pide credenciales de Grafana) — sacarlas a variable, sin exponer
- **DONDE:** Terminal (master)
- **ACCION:** Leer usuario y password admin de Grafana desde su Secret.
- **COMANDO:**
```bash
GF_USER=$(kubectl get secret kps-grafana -n observability -o jsonpath='{.data.admin-user}' | base64 -d)
GF_PASS=$(kubectl get secret kps-grafana -n observability -o jsonpath='{.data.admin-password}' | base64 -d)
echo "usuario: $GF_USER"   # el password queda en \$GF_PASS, lo tecleo sin leerlo en voz alta
```
- **NARRACION:** "Las credenciales de Grafana tambien salen de un Secret, no estan quemadas en ningun lado."
- **ESPERADO:** Imprime el usuario admin; el password queda en `$GF_PASS` para teclear en el login.

---

## PASO 4 — Consultar el pedido en Grafana (lo visual)

- **DONDE:** Navegador (Grafana → Explore)
- **ACCION:** Seleccionar el datasource **Loki** (arriba a la izquierda) y pegar la query con el parser JSON filtrando por `pedidoId`. Sustituye `PED-2606-0001` por un pedidoId real de los que acabas de crear.
- **COMANDO (LogQL, pegar en el cuadro de query):**
```logql
{namespace="micrositio", app="api"} | json | pedidoId="PED-2606-0001"
```
- **NARRACION:** "Filtro por el pedidoId dentro del JSON y Grafana me trae toda la historia de ese pedido al instante."
- **ESPERADO:** Aparecen las lineas de log de ese pedido (ej. `"msg":"Pedido confirmado"`), ordenadas en el tiempo. Pon el rango de tiempo en "Last 1 hour".

> Tip de demo: si no recuerdas un pedidoId exacto, primero corre `{namespace="micrositio", app="api"} |= "pedidoId"` para ver todos los pedidos recientes y de ahi copias uno.

---

## PASO 5 — Lo mismo por CLI (respaldo si falla el navegador)

### 5a — Logs de la API (ultimos 5 min)
- **DONDE:** Terminal (master)
- **ACCION:** Consultar Loki directamente desde dentro del cluster (sin UI).
- **COMANDO:**
```bash
kubectl exec -n observability loki-0 -c loki -- wget -qO- \
  "http://localhost:3100/loki/api/v1/query_range?query=%7Bnamespace%3D%22micrositio%22%2Capp%3D%22api%22%7D&limit=5&since=300s" \
  2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
for r in d.get('data', {}).get('result', [])[:3]:
    print(f\"  Pod: {r['stream'].get('pod','?')[:30]}\")
    for v in r['values'][:1]:
        print(f\"  -> {v[1][:150]}\")"
```
- **NARRACION:** "Y si Grafana no estuviera, hago la misma consulta a la API HTTP de Loki por linea de comandos."
- **ESPERADO:** 1-3 bloques `Pod: api-...` con una linea de log JSON cada uno.

### 5b — Filtrar por un pedidoId concreto (la prueba clave)
- **DONDE:** Terminal (master)
- **ACCION:** Buscar SOLO las lineas de un pedido usando filtro de linea. Cambia `PED-2606-0001` por uno real.
- **COMANDO:**
```bash
PED="PED-2606-0001"
Q="{namespace=\"micrositio\", app=\"api\"} |= \`$PED\`"
ENC=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$Q")
kubectl exec -n observability loki-0 -c loki -- wget -qO- \
  "http://localhost:3100/loki/api/v1/query_range?query=$ENC&limit=20&since=3600s" \
  2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
n = sum(len(r['values']) for r in d.get('data',{}).get('result',[]))
print(f'  Lineas para $PED: {n}')
for r in d.get('data',{}).get('result',[])[:1]:
    for v in r['values'][:3]:
        print('  ->', v[1][:140])"
```
- **NARRACION:** "Filtro por ese pedidoId y me devuelve exactamente las lineas de ese pedido y nada mas."
- **ESPERADO:** `Lineas para PED-...: N` (N>=1) y al menos una linea JSON con `"pedidoId":"PED-..."` y `"msg":"Pedido confirmado"`.

---

## PASO 6 — Confirmar que Loki tiene logs activos (cifra de cierre)

- **DONDE:** Terminal (master)
- **ACCION:** Contar streams del namespace micrositio en los ultimos 5 min.
- **COMANDO:**
```bash
kubectl exec -n observability loki-0 -c loki -- wget -qO- \
  "http://localhost:3100/loki/api/v1/query?query=count(count_over_time(%7Bnamespace%3D%22micrositio%22%7D%5B5m%5D))" \
  2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f\"  Streams en micrositio (5 min): {d.get('data',{}).get('result',[{}])[0].get('value',[0,'N/A'])[1]}\")"
```
- **NARRACION:** "Y para cerrar, confirmo que Loki esta recibiendo logs en vivo del namespace de la app."
- **ESPERADO:** `Streams en micrositio (5 min): <numero>` (un numero > 0).

---

## CIERRE (decir al profe)

> "En Grafana → Explore → Loki, con `{namespace=\"micrositio\", app=\"api\"} | json | pedidoId=\"PED-...\"` recupero la historia completa de cualquier pedido en menos de 30 segundos. El pedidoId viaja en el JSON del log, Alloy lo recolecta y Loki lo indexa: eso es trazabilidad de extremo a extremo."

---

## NOTAS / GOTCHAS verificados contra el cluster en vivo

- La IP del ingress hoy es `10.211.55.38` (la `10.211.55.37` del script esta muerta). Por eso se usa `$IP` calculada.
- El `/etc/hosts` del Mac resuelve `zuyu.local` y `grafana.zuyu.local` -> por eso el navegador no necesita `--resolve`; el `curl` si lo necesita.
- `pedidoId` **no aparece** en `GET /loki/api/v1/labels` (no es label). El script intenta `/label/pedidoId/values` y por eso sale vacio: es esperado, no es un error. Usa filtro de linea o `| json`.
- Credenciales de Grafana: estan en el Secret `kps-grafana` (`admin-user` / `admin-password`), **no** son `admin/admin123` como dice el comentario viejo del script.
- Formato real de la linea de log verificada: `{"level":"info","time":"...","pedidoId":"PED-2606-0001","msg":"Pedido confirmado"}`.

**🎯 Frase de cierre:** _"Cada log de la app sale como JSON con su pedidoId; Alloy lo manda a Loki y desde Grafana sigo toda la historia de un pedido en menos de 30 segundos."_


---

# RUNBOOK MANUAL — Seguridad: Webhook iVoy firmado con HMAC

**Demo:** `demos/demo-extra-webhook-hmac.sh`
**Punto que defiende:** seguridad (autenticidad de webhooks externos + anti-replay)
**Duracion estimada:** 6-8 minutos

**Idea en una frase (para abrir):** "El endpoint `/webhooks/delivery` que escucha a la paqueteria iVoy NO confia en nadie: cada request debe traer una firma HMAC SHA256 calculada con un secreto compartido y un timestamp reciente. Voy a mostrar que un webhook bien firmado pasa (200) y que todo intento de falsificacion o de reenvio viejo se rechaza."

> NOTA: La IP fija `10.211.55.37` del script viejo esta MUERTA. En este runbook la IP del ingress se descubre en vivo con la variable `$IP` y se usa `--resolve zuyu.local:443:$IP` en cada curl. Para lo visual usamos el navegador con `https://zuyu.local/...` (el `/etc/hosts` del Mac ya lo resuelve).

---

## SETUP (Terminal master) — hacer una sola vez antes de empezar

### Paso 1 — Descubrir la IP del nodo del ingress
- **DONDE:** Terminal (master)
- **ACCION:** Obtener el `hostIP` del pod controller de ingress-nginx y guardarlo en `$IP`.
- **COMANDO:**
```bash
IP=$(kubectl get pod -n ingress-nginx -l app.kubernetes.io/component=controller -o jsonpath='{.items[0].status.hostIP}'); echo $IP
```
- **NARRACION:** "Primero resuelvo en vivo a que nodo apunta el ingress; con esto los curl van directo al cluster real, no a una IP fija quemada."
- **ESPERADO:** Imprime una IP del rango del cluster (ej. `10.211.55.x`). Si sale vacio, el ingress no esta arriba.

### Paso 2 — Cargar el secreto HMAC del cluster (sin exponerlo)
- **DONDE:** Terminal (master)
- **ACCION:** Leer `WEBHOOK_SECRET_IVOY` del Secret `api-env` a una variable.
- **COMANDO:**
```bash
SECRET=$(kubectl get secret api-env -n micrositio -o jsonpath='{.data.WEBHOOK_SECRET_IVOY}' | base64 -d); echo "Secret cargado (${SECRET:0:8}...)"
```
- **NARRACION:** "El secreto compartido con iVoy vive en un Secret de Kubernetes; lo cargo a una variable y solo muestro los primeros caracteres, nunca el valor completo."
- **ESPERADO:** `Secret cargado (xxxxxxxx...)` — solo un prefijo, el secreto no se imprime entero.

### Paso 3 — Definir el pedido y el id de delivery de la demo
- **DONDE:** Terminal (master)
- **ACCION:** Fijar el pedido objetivo y generar un id de delivery unico.
- **COMANDO:**
```bash
PEDIDO_ID="PED-2605-0001"; DELIVERY_ID="iv-sim-$(date +%s)"; echo "$PEDIDO_ID / $DELIVERY_ID"
```
- **NARRACION:** "Voy a marcar como entregado el pedido `PED-2605-0001` (el que crea la demo del flujo completo); si no existe, lo recreo corriendo primero la demo 1."
- **ESPERADO:** Imprime `PED-2605-0001 / iv-sim-<numero>`.

---

## PARTE A — El webhook BIEN firmado entra (200)

### Paso 4 — Armar el payload y el timestamp
- **DONDE:** Terminal (master)
- **ACCION:** Construir el cuerpo JSON del webhook con timestamp actual.
- **COMANDO:**
```bash
TIMESTAMP=$(date +%s); BODY="{\"orderId\":\"$DELIVERY_ID\",\"status\":\"delivered\",\"pedidoId\":\"$PEDIDO_ID\",\"driver\":{\"name\":\"Pedro Demo\",\"phone\":\"+525555550999\"},\"timestamp\":$TIMESTAMP}"; echo "$BODY"
```
- **NARRACION:** "Este es el JSON que iVoy mandaria al confirmar la entrega: el pedido, el estado 'delivered', el repartidor y un timestamp."
- **ESPERADO:** Se imprime el JSON completo con `status:delivered` y el timestamp numerico.

### Paso 5 — Firmar el payload con HMAC SHA256
- **DONDE:** Terminal (master)
- **ACCION:** Calcular la firma HMAC SHA256 del body usando el secreto.
- **COMANDO:**
```bash
SIGNATURE=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}'); echo "sha256=$SIGNATURE"
```
- **NARRACION:** "Firmo exactamente esos bytes con el secreto compartido: esta es la firma que prueba que el mensaje viene de quien dice y que no fue alterado."
- **ESPERADO:** Imprime `sha256=<hash hex de 64 caracteres>`.

### Paso 6 — Enviar el webhook firmado (debe responder 200)
- **DONDE:** Terminal (master)
- **ACCION:** POST al endpoint con los headers de firma y timestamp.
- **COMANDO:**
```bash
curl -ks --resolve zuyu.local:443:$IP -X POST "https://zuyu.local/webhooks/delivery?provider=ivoy" -H "Content-Type: application/json" -H "x-ivoy-signature: sha256=$SIGNATURE" -H "x-ivoy-timestamp: $TIMESTAMP" -d "$BODY" -w "\n--> HTTP %{http_code} en %{time_total}s\n"
```
- **NARRACION:** "Mando el webhook con su firma y su timestamp correctos: como todo cuadra, el sistema lo acepta y procesa la entrega."
- **ESPERADO:** `--> HTTP 200` (request aceptado y procesado).

---

## PARTE B — Las falsificaciones se rechazan

### Paso 7 — Mismo body, SIN firma (debe rechazar)
- **DONDE:** Terminal (master)
- **ACCION:** Repetir el POST quitando el header `x-ivoy-signature`.
- **COMANDO:**
```bash
curl -ks --resolve zuyu.local:443:$IP -X POST "https://zuyu.local/webhooks/delivery?provider=ivoy" -H "Content-Type: application/json" -d "$BODY" -w "\n--> HTTP %{http_code} (esperado 401/400 — sin firma)\n" -o /dev/null
```
- **NARRACION:** "Ahora mando exactamente el mismo JSON pero sin firma: aunque el contenido sea valido, sin firma no entra."
- **ESPERADO:** `--> HTTP 401` (o 400). El request es rechazado.

### Paso 8 — Firma INVALIDA (debe rechazar)
- **DONDE:** Terminal (master)
- **ACCION:** POST con una firma basura (`deadbeef...`).
- **COMANDO:**
```bash
curl -ks --resolve zuyu.local:443:$IP -X POST "https://zuyu.local/webhooks/delivery?provider=ivoy" -H "Content-Type: application/json" -H "x-ivoy-signature: sha256=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" -H "x-ivoy-timestamp: $TIMESTAMP" -d "$BODY" -w "\n--> HTTP %{http_code} (esperado 401/400 — firma invalida)\n" -o /dev/null
```
- **NARRACION:** "Un atacante que no conoce el secreto solo puede inventar una firma; aqui mando una firma falsa y el servidor la detecta porque no coincide con el HMAC recalculado."
- **ESPERADO:** `--> HTTP 401` (o 400). Rechazado.

### Paso 9 — Replay attack: timestamp viejo (debe rechazar)
- **DONDE:** Terminal (master)
- **ACCION:** Reconstruir el body con timestamp de hace 1 dia, firmarlo correctamente, y enviarlo.
- **COMANDO:**
```bash
OLD_TS=$((TIMESTAMP - 86400)); OLD_BODY="${BODY/\"timestamp\":$TIMESTAMP/\"timestamp\":$OLD_TS}"; OLD_SIG=$(printf '%s' "$OLD_BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}'); curl -ks --resolve zuyu.local:443:$IP -X POST "https://zuyu.local/webhooks/delivery?provider=ivoy" -H "Content-Type: application/json" -H "x-ivoy-signature: sha256=$OLD_SIG" -H "x-ivoy-timestamp: $OLD_TS" -d "$OLD_BODY" -w "\n--> HTTP %{http_code} (esperado 401/400 — replay attack)\n" -o /dev/null
```
- **NARRACION:** "Caso clave: este request esta PERFECTAMENTE firmado, pero su timestamp es de hace un dia; es un mensaje viejo que alguien intenta reproducir. La ventana de timestamp lo rechaza: firma valida no basta si el mensaje es viejo."
- **ESPERADO:** `--> HTTP 401` (o 400). Rechazado por anti-replay aunque la firma sea matematicamente correcta.

---

## PARTE C — Verificar el efecto real del webhook valido

### Paso 10 — Confirmar que el estado del pedido cambio en la base de datos
- **DONDE:** Terminal (master)
- **ACCION:** Consultar el pedido en MongoDB y mostrar su estado y delivery.
- **COMANDO:**
```bash
APP_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath='{.data.APP_PASSWORD}' | base64 -d); kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet -u app -p "$APP_PASS" --authenticationDatabase micrositio micrositio --eval "const p=db.pedidos.findOne({pedidoId:'$PEDIDO_ID'}); if(!p){print('Pedido no encontrado — corre demo-1 primero');}else{print('Estado: '+p.estado); if(p.delivery){print('Delivery: '+JSON.stringify(p.delivery,null,2));}}"
```
- **NARRACION:** "Y para cerrar el lazo: el unico webhook que aceptamos, el firmado, si tuvo efecto real — el pedido quedo marcado como entregado en la base de datos."
- **ESPERADO:** `Estado: delivered` (o equivalente) y el bloque `Delivery: {...}` con el repartidor. Si dice "Pedido no encontrado", correr antes `demo-1-pedido-completo.sh`.

---

## CIERRE (decir al profe)
"Webhooks firmados con HMAC SHA256 + ventana de timestamp: sin la firma correcta no entra nada, y un request viejo reproducido (replay) se rechaza igual aunque su firma sea valida. Cero spoofeo, cero replay."

---

## TABLA RESUMEN DE RESULTADOS ESPERADOS
| Paso | Caso | HTTP esperado |
|------|------|---------------|
| 6 | Firma valida + timestamp fresco | **200** |
| 7 | Sin header de firma | **401 / 400** |
| 8 | Firma invalida (deadbeef) | **401 / 400** |
| 9 | Replay: firma valida + timestamp viejo | **401 / 400** |
| 10 | Estado en Mongo tras el webhook valido | `delivered` |

## PLAN B (si algo falla en vivo)
- **`$IP` vacio (Paso 1):** verificar `kubectl get pods -n ingress-nginx`; el controller debe estar `Running`.
- **`SECRET` vacio (Paso 2):** confirmar nombre del secret con `kubectl get secret -n micrositio`; debe existir `api-env` con la clave `WEBHOOK_SECRET_IVOY`.
- **Paso 6 no da 200:** revisar que el body del Paso 4 no se haya re-generado con otro timestamp despues de firmar; firma y `x-ivoy-timestamp` deben corresponder al MISMO body.
- **Paso 10 "Pedido no encontrado":** correr primero `demos/demo-1-pedido-completo.sh` para crear `PED-2605-0001`, luego repetir desde el Paso 3.
- **Alternativa visual:** abrir en el **Navegador** `https://zuyu.local/panel/login`, entrar con `demo@zuyu.local` / `Demo1234!` (negocio slug "demo") y mostrar el pedido marcado como entregado en el panel tras el webhook valido.

**🎯 Frase de cierre:** _Webhooks firmados con HMAC SHA256 + ventana de timestamp: sin la firma correcta no entra nada, y un request viejo reproducido (replay) se rechaza igual._
