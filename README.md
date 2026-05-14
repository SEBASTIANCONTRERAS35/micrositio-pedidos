# Micrositio de Pedidos y Delivery

> Proyecto Final · Introducción a DevOps
> Autor: Sebastian Contreras · Profesor: Daniel Guerrero

Micrositio público para que pequeños negocios mexicanos reciban pedidos en línea con entrega
a domicilio, sin pagar comisiones a marketplaces. Cada negocio obtiene su propia URL
(`https://zuyu.local/tienda/<slug>`) con su catálogo en tiempo real.

---

## Arquitectura

```
Cliente (browser)
      |
   Ingress nginx + TLS (cert-manager)
      |
   +---------+      +---------+
   |   api   |----->|  Redis  |<-----+
   | Node 20 |      +---------+      |
   | Express |                  +---------+
   +---------+                  | worker  |
       |                        | BullMQ  |
   +-----------+                +---------+
   | MongoDB   |                     |
   | RS 3 nodos|     Uber Direct / Lalamove / iVoy
   +-----------+     Resend (email) / Twilio (WhatsApp)
```

**Tres procesos, tres pods, en namespace `micrositio`:**

1. `api` — Node.js / Express: sirve vistas EJS, REST API, webhooks
2. `worker` — Node.js / BullMQ: notificaciones y solicitudes a carriers
3. `mongodb` — StatefulSet 3 nodos en Replica Set

---

## Stack

| Capa | Tecnología |
|---|---|
| Vistas | EJS 3 + Alpine.js |
| API | Node.js 20 + Express 5 |
| Worker | Node.js 20 + BullMQ 5 |
| Validación | Zod 3 |
| Auth | JWT RS256 + Argon2 |
| Logs | Pino con redact PII |
| Tests | Vitest + mongodb-memory-server + ioredis-mock + MSW |
| Base de datos | MongoDB 7 (Replica Set) |
| Cola | Redis 7.2 |
| Cluster | Rocky Linux 9 + kubeadm + Calico |
| Storage | nfs-csi (NFS server 192.168.109.210) |
| Ingress | nginx-ingress + cert-manager (self-signed) |
| Observabilidad | Loki + Grafana Alloy + Prometheus + Grafana |
| CI/CD | Tekton Pipelines + ArgoCD |
| Canary | Argo Rollouts |
| Escalado | KEDA 2.19 |

---

## Estructura del repositorio

```
micrositio-pedidos/
├── api/              Backend Express + vistas EJS
├── worker/           Worker BullMQ (notificaciones + delivery)
├── k8s/              Manifiestos Kubernetes
├── tekton/           Pipelines de CI
├── argocd/           Application de CD
├── monitoring/       Helm values + dashboards + alerts
├── docs/             ADRs y documentación
├── scripts/          Scripts de demo y seed
├── docker-compose.yml  Desarrollo local (NO para demo)
├── .env.example      Variables de entorno requeridas
└── README.md
```

---

## Desarrollo local (con Docker Compose)

### Pre-requisitos

- Docker Desktop con docker-compose v2+
- Node.js 20+
- npm 10+

### Setup inicial

```bash
# 1. Clonar el repo
git clone git@github.com:SEBASTIANCONTRERAS35/micrositio-pedidos.git
cd micrositio-pedidos

# 2. Variables de entorno
cp .env.example .env
# Editar .env con valores reales

# 3. Instalar dependencias
npm install

# 4. Levantar Mongo + Redis con docker-compose
docker-compose up -d mongodb redis

# 5. Inicializar Replica Set (solo la primera vez)
docker-compose exec mongodb mongosh --eval "rs.initiate()"

# 6. Levantar la app y el worker
docker-compose up api worker

# 7. Abrir en el navegador
open http://localhost:3000/tienda/demo
```

### Comandos útiles

```bash
# Tests
npm test                    # Tests unitarios
npm run test:integration    # Tests con Testcontainers (Mongo + Redis reales)
npm run test:coverage       # Coverage report

# Linting
npm run lint
npm run lint:fix
npm run format

# Seguridad
npm run audit:security      # npm audit
```

---

## Despliegue en Kubernetes

> **Cluster requerido:** 1 master + 2 workers, Rocky Linux 9, kubeadm, Calico CNI,
> NFS server en `192.168.109.210` con StorageClass `nfs-csi` configurado.

### Despliegue inicial (orden importa)

```bash
# 1. Namespace y Pod Security Standards
kubectl apply -f k8s/namespace.yaml

# 2. Bases de datos
kubectl apply -f k8s/mongodb/
kubectl apply -f k8s/redis/

# Esperar a que MongoDB esté Running y luego inicializar Replica Set
kubectl exec -it mongodb-0 -n micrositio -- mongosh --eval "rs.initiate()"

# 3. cert-manager + ClusterIssuer
kubectl apply -f k8s/cert-manager/

# 4. NetworkPolicies
kubectl apply -f k8s/networkpolicy/

# 5. ResourceQuota
kubectl apply -f k8s/resourcequota/

# 6. App + Worker (Rollout en lugar de Deployment)
kubectl apply -f k8s/api/
kubectl apply -f k8s/worker/
kubectl apply -f k8s/rollouts/

# 7. Ingress
kubectl apply -f k8s/ingress.yaml

# 8. Configurar /etc/hosts del laptop de demo
echo "$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}') zuyu.local" | sudo tee -a /etc/hosts

# 9. Importar el CA raíz en el browser para candado verde
kubectl get secret root-ca -n cert-manager -o jsonpath='{.data.ca\.crt}' | base64 -d > /tmp/ca.crt
# Luego importar /tmp/ca.crt en Chrome/Firefox como Authority
```

### Verificación post-deploy

```bash
# Pods Running
kubectl get pods -n micrositio

# Replica Set inicializado
kubectl exec -it mongodb-0 -n micrositio -- mongosh --eval "rs.status()"

# Ingress responde
curl -k https://zuyu.local/health/ready
```

---

## CI/CD

### Pipeline de Tekton

```bash
# Aplicar Tasks y Pipeline
kubectl apply -f tekton/

# Disparar manualmente
kubectl create -f tekton/pipelinerun-example.yaml
```

### ArgoCD

```bash
kubectl apply -f argocd/application.yaml
# Acceder a la UI:
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

---

## Observabilidad

### Loki + Grafana Alloy

```bash
helm install loki grafana/loki -f monitoring/loki-values.yaml -n monitoring --create-namespace
helm install alloy grafana/alloy -f monitoring/alloy-values.yaml -n monitoring
```

### Prometheus + Grafana

```bash
helm install prometheus prometheus-community/kube-prometheus-stack \
  -f monitoring/prometheus-values.yaml -n monitoring
```

### Búsqueda de pedido por ID en Loki

```logql
{namespace="micrositio"} | json | pedidoId="PED-XXX"
```

---

## Demos para la defensa

Los scripts de las 8 demos están en `scripts/`:

1. `demo-1-flujo-completo.sh` — Flujo end-to-end de un pedido (4 min)
2. `demo-2-mongo-failover.sh` — Replica Set sobrevive a la muerte del primario (2 min)
3. `demo-3-network-policy.sh` — Pod no autorizado bloqueado (2 min)
4. `demo-4-keda-scale.sh` — Worker escala arriba y abajo según cola Redis (3 min)
5. `demo-5-cicd.sh` — `git push` → deploy automático (3 min)
6. `demo-6-canary.sh` — Rollout 10% → 50% → 100% (2 min)
7. `demo-7-loki-search.sh` — Búsqueda de pedido por ID en Loki (2 min)
8. Q&A — 2 min

Total: 20 minutos.

---

## Documentación adicional

- `docs/adr/` — Architecture Decision Records (decisiones técnicas justificadas)
- `SECURITY.md` — Política de seguridad
- `CONTRIBUTING.md` — Guía de contribución

---

## Licencia

MIT — uso académico y educativo.
