# Presentación ejecutiva — Micrositio de Pedidos y Delivery (ZUYU)

> Formato: cada bloque separado por `---` es **una diapositiva**. El texto en
> *cursiva "🎤"* es lo que dices en voz alta (nota del presentador), no va en la
> slide. Pégalo en Google Slides / PowerPoint. Mantenlo ejecutivo: pocos bullets.

---

## Micrositio de Pedidos y Delivery
**Proyecto final — Kubernetes / DevOps**

- Alumno: Sebastián Contreras · Grupo G-02
- Plataforma de pedidos en línea + delivery para negocios, desplegada sobre Kubernetes
- Capa nueva sobre **ZUYU** (mi SaaS real de punto de venta para PyMEs)

*🎤 "Construí un micrositio donde un cliente hace un pedido a un negocio y se gestiona el repartidor automáticamente, todo corriendo en un cluster de Kubernetes hecho a mano."*

---

## El problema y la solución
- Un negocio necesita **vender en línea + coordinar entregas** sin montar infraestructura.
- Solución: una app web (catálogo → carrito → pedido → repartidor → entrega) **lista para producción**: alta disponibilidad, escalado automático, seguridad de red, CI/CD y observabilidad.

*🎤 "El objetivo no era solo que funcione, sino que esté operada como un sistema de producción real."*

---

## Arquitectura (vista de pájaro)
```
Cliente → Ingress (HTTPS) → API (Node/Express)
                                ├── MongoDB (Replica Set ×3)   ← pedidos
                                └── Redis (cola)  → Worker → carrier de delivery
```
- **3 nodos**: 1 master + 2 workers (Rocky Linux, kubeadm, CNI Calico)
- Todo en el namespace `micrositio`, desplegado por **GitOps**

*🎤 "El API atiende al cliente; lo pesado (pedir repartidor, notificar) lo hace un worker asíncrono por una cola, para no bloquear la venta."*

---

## MongoDB — Replica Set (alta disponibilidad de datos)
- **Qué es:** 3 instancias de MongoDB (`StatefulSet`) que replican los mismos datos: 1 PRIMARY + 2 SECONDARY.
- **Cómo funciona:** si el PRIMARY cae, los demás **eligen** uno nuevo automáticamente; la app no se entera. Cada pedido + descuento de stock se hace en una **transacción atómica** (o todo, o nada).
- **Por qué:** los pedidos son dinero — no se pueden perder ni quedar a medias.

*🎤 "En la demo voy a matar un nodo y el sistema sigue vendiendo."*

---

## NetworkPolicy — firewall entre pods (seguridad de red)
- **Qué es:** reglas de quién puede hablar con quién dentro del cluster.
- **Cómo funciona:** estrategia **default-deny** (bloqueo todo) + permitir solo lo necesario (API→Mongo, API/Worker→Redis, Ingress→API). Lo aplica el CNI **Calico**.
- **Por qué:** si un pod se compromete, no puede moverse lateralmente a la base de datos.

*🎤 "En la demo, un pod sin permiso intenta conectarse a Mongo y la conexión se cae: bloqueado por política."*

---

## KEDA — escalado automático por demanda
- **Qué es:** autoscaler que mide la **longitud de la cola Redis** del worker.
- **Cómo funciona:** si se acumulan pedidos en la cola, KEDA **crea más pods** del worker (de 1 hasta 5); cuando la cola se vacía, los **baja** a 1.
- **Por qué:** aguanta picos (ej. hora pico) sin desperdiciar recursos en horas muertas.

*🎤 "Voy a inyectar carga a la cola y verán cómo el worker pasa de 1 a 4 pods solo."*

---

## CI/CD — Tekton + ArgoCD (GitOps)
- **Tekton:** al hacer `git push`, construye la imagen Docker dentro del cluster (Kaniko) y la sube al registro local **y a Docker Hub** (doble push).
- **ArgoCD:** vigila el repo de Git y **despliega solo** lo que cambie; con `selfHeal` revierte cualquier cambio manual → Git es la única fuente de verdad.
- **Por qué:** despliegues reproducibles, auditables y sin tocar el cluster a mano.

*🎤 "Hago un push y el cluster se actualiza solo; si alguien edita algo a mano, ArgoCD lo regresa al estado de Git."*

---

## Argo Rollouts — despliegue Canary (cero downtime)
- **Qué es:** estrategia de despliegue gradual de versiones nuevas del API.
- **Cómo funciona:** la versión nueva recibe **10% → 50% → 100%** del peso por pasos; un **AnalysisTemplate** mide el error-rate y hace **rollback automático** si algo sale mal.
- **Por qué:** una versión rota no tumba a todos los usuarios; se detecta y revierte sola.

*🎤 "Promuevo el canary en vivo y, si el error-rate sube, el rollout se devuelve solo."*

---

## Observabilidad — Loki + Prometheus + Grafana
- **Métricas (Prometheus):** latencia del API, longitud de cola, error-rate; con **alertas** automáticas.
- **Logs (Loki + Grafana Alloy):** todos los logs centralizados; busco un pedido por su `pedidoId` en segundos.
- **Por qué:** en producción, sin medir no operas — detectas problemas antes que el cliente.

*🎤 "Busco un pedido por su ID en los logs de Loki en vivo."*

---

## Seguridad y gobernanza
- **Ingress + TLS:** acceso por HTTPS (`zuyu.local`) con certificado emitido por **cert-manager** (CA propia).
- **ResourceQuota:** límites de CPU/memoria por namespace → un servicio no puede acaparar el cluster.
- **Secrets cifrados** (SealedSecrets) y contraseñas con **Argon2**.

*🎤 "Intento crear un pod que excede la cuota y el cluster lo rechaza."*

---

## Stack en una mirada
| Capa | Herramienta |
|---|---|
| App | Node.js + Express + EJS + Alpine.js |
| Datos | MongoDB 7 (Replica Set) · Redis 7 + BullMQ |
| Cluster | kubeadm + Calico (VXLAN), 3 nodos |
| CI/CD | Tekton + ArgoCD + Argo Rollouts |
| Escalado | KEDA + HPA |
| Observabilidad | Prometheus + Loki + Grafana |
| Seguridad | NetworkPolicy + cert-manager + SealedSecrets |

*🎤 "Todo esto es estándar de la industria; lo monté de cero sobre bare-metal."*

---

## Gracias — Demo en vivo
- Repo: github.com/SEBASTIANCONTRERAS35/micrositio-pedidos
- ¿Preguntas?

*🎤 Pasar directo a las 7 demos en el cluster.*
