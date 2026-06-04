---
title: "Micrositio de Pedidos y Delivery"
subtitle: "Proyecto final — Kubernetes / DevOps"
author: "Sebastián Contreras · Grupo G-02 · Capa sobre ZUYU"
---

# El problema y la solución

- **Problema:** un negocio quiere vender en línea y coordinar entregas sin montar infraestructura.
- **Solución:** app web (catálogo → carrito → pedido → repartidor → entrega) lista para **producción**.
- Alta disponibilidad, escalado automático, seguridad de red, CI/CD y observabilidad.

::: notes
El objetivo no era solo que funcione, sino que esté OPERADA como un sistema de producción real.
:::

# Arquitectura (vista de pájaro)

```
Cliente → Ingress (HTTPS) → API (Node/Express)
                              ├── MongoDB (Replica Set ×3)  ← pedidos
                              └── Redis (cola) → Worker → carrier delivery
```

- 3 nodos: 1 master + 2 workers (Rocky Linux, kubeadm, CNI Calico).
- Todo en el namespace `micrositio`, desplegado por **GitOps**.

::: notes
El API atiende al cliente; lo pesado (pedir repartidor, notificar) lo hace un worker asíncrono por una cola, para no bloquear la venta.
:::

# MongoDB — Replica Set (alta disponibilidad)

- **Qué es:** 3 instancias MongoDB (StatefulSet) que replican los datos: 1 PRIMARY + 2 SECONDARY.
- **Cómo funciona:** si el PRIMARY cae, eligen uno nuevo solos; cada pedido + descuento de stock es una **transacción atómica**.
- **Por qué:** los pedidos son dinero — no se pueden perder ni quedar a medias.

::: notes
DEMO: voy a matar un nodo y el sistema sigue vendiendo.
:::

# NetworkPolicy — firewall entre pods

- **Qué es:** reglas de quién puede hablar con quién dentro del cluster.
- **Cómo funciona:** default-deny (bloqueo todo) + permitir solo lo necesario. Lo aplica el CNI **Calico**.
- **Por qué:** si un pod se compromete, no puede moverse hasta la base de datos.

::: notes
DEMO: un pod sin permiso intenta conectarse a Mongo y la conexión se cae: bloqueado por política.
:::

# KEDA — escalado automático por demanda

- **Qué es:** autoscaler que mide la **longitud de la cola Redis** del worker.
- **Cómo funciona:** si se acumulan pedidos, KEDA crea más pods del worker (1→5); cuando la cola se vacía, los baja a 1.
- **Por qué:** aguanta picos sin desperdiciar recursos en horas muertas.

::: notes
DEMO: inyecto carga a la cola y verán al worker pasar de 1 a 4 pods solo.
:::

# CI/CD — Tekton + ArgoCD (GitOps)

- **Tekton:** al hacer `git push`, construye la imagen (Kaniko) y la sube al registro local **y a Docker Hub**.
- **ArgoCD:** vigila Git y despliega solo; con `selfHeal` revierte cambios manuales → Git es la única verdad.
- **Por qué:** despliegues reproducibles, auditables y sin tocar el cluster a mano.

::: notes
Hago un push y el cluster se actualiza solo; si alguien edita a mano, ArgoCD lo regresa al estado de Git.
:::

# Argo Rollouts — Canary (cero downtime)

- **Qué es:** despliegue gradual de versiones nuevas del API.
- **Cómo funciona:** la versión nueva recibe **10% → 50% → 100%** por pasos; un AnalysisTemplate hace **rollback automático** si el error sube.
- **Por qué:** una versión rota no tumba a todos; se detecta y revierte sola.

::: notes
DEMO: promuevo el canary en vivo; si el error-rate sube, el rollout se devuelve solo.
:::

# Observabilidad — Loki + Prometheus + Grafana

- **Métricas (Prometheus):** latencia del API, longitud de cola, error-rate + **alertas** automáticas.
- **Logs (Loki + Alloy):** logs centralizados; busco un pedido por su `pedidoId` en segundos.
- **Por qué:** en producción, sin medir no operas — detectas problemas antes que el cliente.

::: notes
DEMO: busco un pedido por su ID en los logs de Loki en vivo.
:::

# Seguridad y gobernanza

- **Ingress + TLS:** acceso HTTPS (`zuyu.local`) con certificado de cert-manager (CA propia).
- **ResourceQuota:** límites de CPU/memoria por namespace → ningún servicio acapara el cluster.
- **Secrets:** cifrados con SealedSecrets; contraseñas con **Argon2**.

::: notes
DEMO: intento crear un pod que excede la cuota y el cluster lo rechaza.
:::

# Stack en una mirada

| Capa | Herramienta |
|---|---|
| Aplicación | Node.js + Express + EJS + Alpine.js |
| Datos | MongoDB 7 (Replica Set) · Redis 7 + BullMQ |
| Cluster | kubeadm + Calico (VXLAN), 3 nodos |
| CI/CD | Tekton + ArgoCD + Argo Rollouts |
| Escalado | KEDA + HPA |
| Observabilidad | Prometheus + Loki + Grafana |
| Seguridad | NetworkPolicy + cert-manager + SealedSecrets |

::: notes
Todo esto es estándar de la industria; lo monté de cero sobre bare-metal.
:::

# Gracias — Demo en vivo

- github.com/SEBASTIANCONTRERAS35/micrositio-pedidos
- ¿Preguntas? → pasamos a las 7 demos en el cluster

::: notes
Pasar directo a las demos en vivo.
:::
