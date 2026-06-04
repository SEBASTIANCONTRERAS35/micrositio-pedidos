# Micrositio de Pedidos y Delivery

> Proyecto Final · Materia: Introducción a DevOps
> **Autor:** Sebastián Contreras · **Profesor:** Daniel Guerrero
> **Entrega:** 5 de junio 2026

Micrositio público para que pequeños negocios mexicanos reciban pedidos en línea con entrega
a domicilio, sin pagar comisiones a marketplaces. Cada negocio obtiene su propia URL
(`https://zuyu.local/tienda/<slug>`) con su catálogo en tiempo real.

---

## Tabla de contenidos

- [Arquitectura](#arquitectura)
- [Stack tecnológico](#stack-tecnológico)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Despliegue completo en cluster bare-metal](#despliegue-completo-en-cluster-bare-metal)
- [Las 8 demos para la defensa](#las-8-demos-para-la-defensa)
- [Desarrollo local (Docker Compose)](#desarrollo-local-docker-compose)
- [Troubleshooting](#troubleshooting)
- [Decisiones arquitectónicas](#decisiones-arquitectónicas)

---

## Arquitectura

```
                    cliente browser (zuyu.local)
                              |
                       Ingress nginx + TLS
                       (cert-manager CA)
                              |
                  +-----------+-----------+
                  |                       |
              Rollout/api              Service/grafana
              (canary 10→50→100)         (observability)
                  |
        +---------+---------+
        |                   |
     Service               Worker
     MongoDB               (BullMQ)
     headless                |
        |                Service
   StatefulSet           Redis
   mongodb              (single + AOF)
   (3 nodos RS)
        |
    PVC nfs-csi (NFS en master node)

GitOps:  push GitHub → Tekton (build+kaniko) → registry local → ArgoCD sync → cluster
```

**Pods en namespace `micrositio`:**

| Pod                           | Cantidad | Propósito                          |
| ----------------------------- | -------- | ---------------------------------- |
| `api` (Rollout)               | 2        | Express + EJS + REST               |
| `worker` (Deployment + KEDA)  | 1-5      | BullMQ (notificaciones + delivery) |
| `mongodb-0/1/2` (StatefulSet) | 3        | Replica Set rs0                    |
| `redis` (Deployment)          | 1        | Cola BullMQ con AOF                |

---

## Stack tecnológico

### Aplicación

| Capa       | Tecnología                                    | Versión   |
| ---------- | --------------------------------------------- | --------- |
| Vistas     | EJS + Alpine.js                               | 3.x / 3.x |
| API        | Node.js + Express                             | 20 / 5.x  |
| Worker     | Node.js + BullMQ                              | 20 / 5.x  |
| Auth       | JWT RS256 + Argon2                            | —         |
| Validación | Zod                                           | 3.x       |
| Logs       | Pino con redact PII                           | —         |
| Tests      | Vitest + mongodb-memory-server + ioredis-mock | —         |

### Infraestructura Kubernetes

| Componente     | Versión                                      | Propósito             |
| -------------- | -------------------------------------------- | --------------------- |
| Cluster        | kubeadm K8s                                  | 1.28.15               |
| OS             | Rocky Linux                                  | 10.1 ARM64            |
| CNI            | Calico (tigera-operator)                     | v3.28.2 VXLAN         |
| Storage        | csi-driver-nfs                               | 4.9.0 (NFS en master) |
| Ingress        | ingress-nginx (DaemonSet hostNetwork)        | v1.11.3               |
| TLS            | cert-manager + ClusterIssuer self-signed CA  | v1.14.7               |
| Database       | MongoDB Replica Set 3 nodos                  | 7.0.14                |
| Cola           | Redis                                        | 7.2-alpine            |
| Escalado       | KEDA (Redis list trigger)                    | v2.15.2               |
| Observabilidad | Loki + Grafana Alloy + kube-prometheus-stack | 6.16 / 0.9.2 / 61.9   |
| CI/CD          | Tekton Pipelines + ArgoCD                    | v0.65.0 / v2.11.7     |
| Canary         | Argo Rollouts                                | v1.7.2                |
| Registry       | registry:2 (in-cluster NodePort 30500)       | —                     |

---

## Estructura del repositorio

```
micrositio-pedidos/
├── api/                          Backend Express + vistas EJS + tests Vitest
│   └── Dockerfile                Multi-stage builder→distroless (npm workspaces)
├── worker/                       Worker BullMQ
│   └── Dockerfile                Multi-stage builder→distroless
├── k8s/                          Manifests aplicados por ArgoCD
│   ├── namespace.yaml            ns micrositio con PSS baseline
│   ├── api/                      Service + ServiceAccount + secrets.example
│   ├── worker/                   Deployment + ScaledObject KEDA + sa
│   ├── mongodb/                  StatefulSet RS 3 nodos + headless service + sa
│   ├── redis/                    Deployment + Service + PVC + ConfigMap
│   ├── cert-manager/             ClusterIssuers + Certificate root CA
│   ├── ingress.yaml              Ingress zuyu.local con TLS
│   ├── networkpolicy/            10 netpols (default-deny + reglas explícitas)
│   ├── resourcequota/            ResourceQuota + LimitRange
│   ├── alerts/                   PrometheusRule (4 alertas)
│   └── rollouts/                 Rollout api (canary) + AnalysisTemplate
├── tekton/                       Pipeline build-and-push (kaniko)
├── argocd/
│   └── application.yaml          Application apuntando a k8s/
├── monitoring/                   Helm values (Loki / Alloy / Prometheus)
├── docs/adr/                     Architecture Decision Records
├── docker-compose.yml            Dev local (NO para defensa)
└── .env.example
```

---

## Despliegue completo en cluster bare-metal

> Este es el procedimiento desde cero. Si vienes a verificar la entrega, todo ya está corriendo.

### Pre-requisitos

- 3 VMs Rocky Linux 9/10 (1 master + 2 workers), 4 CPU / 4 GB RAM / 25 GB cada una
- Network: VMs en la misma subred (ej. `10.211.55.0/24`)
- `kubectl`, `helm 3.16+`, `git` instalados
- Cuenta GitHub con acceso al repo

### 1. Bootstrap del cluster

```bash
# En el master:
sudo kubeadm init --pod-network-cidr=10.244.0.0/16

# En cada worker:
sudo kubeadm join <master-ip>:6443 --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash>

# En el master, configurar kubectl:
mkdir -p ~/.kube && sudo cp /etc/kubernetes/admin.conf ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
```

### 2. Pre-flight en TODOS los nodos

```bash
# Instalar kernel-modules-extra (br_netfilter)
sudo dnf install -y kernel-modules-extra-$(uname -r) nfs-utils

# Cargar módulos
sudo modprobe overlay br_netfilter

# Sysctls
sudo tee /etc/sysctl.d/k8s.conf <<EOF
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sudo sysctl --system

# Firewall
sudo firewall-cmd --permanent --add-port={6443,2379-2380,10250,10251,10252,10255,179,5473,80,443,30000-32767}/tcp
sudo firewall-cmd --permanent --add-port={8285,8472,4789}/udp
sudo firewall-cmd --permanent --add-service={nfs,rpc-bind,mountd}
sudo firewall-cmd --reload

# Swap off + fstab
sudo swapoff -a
sudo sed -i '/swap/s/^/#/' /etc/fstab
```

### 3. NFS server en el master

```bash
# En el master
sudo mkdir -p /srv/nfs/k8s
sudo chown nobody:nobody /srv/nfs/k8s
echo "/srv/nfs/k8s 10.211.55.0/24(rw,sync,no_subtree_check,no_root_squash) 10.244.0.0/16(rw,sync,no_subtree_check,no_root_squash)" | sudo tee /etc/exports
sudo systemctl enable --now nfs-server rpcbind
sudo exportfs -ra
```

### 4. CNI Calico v3.28.2 (VXLAN)

```bash
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.2/manifests/tigera-operator.yaml

cat <<EOF | kubectl apply -f -
apiVersion: operator.tigera.io/v1
kind: Installation
metadata: { name: default }
spec:
  calicoNetwork:
    ipPools:
    - cidr: 10.244.0.0/16
      encapsulation: VXLAN
      natOutgoing: Enabled
      nodeSelector: all()
    linuxDataplane: Iptables
---
apiVersion: operator.tigera.io/v1
kind: APIServer
metadata: { name: default }
spec: {}
EOF

# En TODOS los nodos: vxlan.calico + cali+ a zona trusted firewalld
sudo firewall-cmd --permanent --zone=trusted --add-interface=vxlan.calico
sudo firewall-cmd --permanent --zone=trusted --add-interface=cali+
sudo firewall-cmd --reload
```

### 5. Helm + repos

```bash
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | sudo bash

helm repo add csi-driver-nfs https://raw.githubusercontent.com/kubernetes-csi/csi-driver-nfs/master/charts
helm repo add jetstack https://charts.jetstack.io
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add kedacore https://kedacore.github.io/charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
```

### 6. Storage csi-driver-nfs + StorageClass

```bash
helm install csi-driver-nfs csi-driver-nfs/csi-driver-nfs \
  -n kube-system --version 4.9.0

kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: nfs-csi
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: nfs.csi.k8s.io
parameters:
  server: <MASTER-IP>
  share: /srv/nfs/k8s
reclaimPolicy: Retain
volumeBindingMode: Immediate
mountOptions: [nfsvers=4.1, hard, timeo=600, retrans=2]
EOF
```

### 7. cert-manager + ClusterIssuers

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.7/cert-manager.crds.yaml
helm install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace --version v1.14.7 \
  --set installCRDs=false

# CA root + ClusterIssuer (los crea el chart aplicado en step 11)
```

### 8. ingress-nginx (DaemonSet hostNetwork)

```bash
helm install ingress-nginx ingress-nginx/ingress-nginx \
  -n ingress-nginx --create-namespace --version 4.11.3 \
  --set controller.kind=DaemonSet \
  --set controller.hostNetwork=true \
  --set controller.hostPort.enabled=true \
  --set controller.dnsPolicy=ClusterFirstWithHostNet \
  --set controller.admissionWebhooks.enabled=false
```

### 9. KEDA

```bash
helm install keda kedacore/keda -n keda --create-namespace --version 2.15.2
```

> KEDA escala el worker por la cola Redis (métrica externa, no necesita metrics-server).

### 9.5. metrics-server (para `kubectl top` y el HPA por CPU del API)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.7.2/components.yaml
# kubeadm usa certs de kubelet self-signed -> metrics-server necesita este flag:
kubectl patch deployment metrics-server -n kube-system --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
kubectl rollout status deployment metrics-server -n kube-system --timeout=120s
# Verificar:
kubectl top nodes
```

### 10. Stack de observabilidad

```bash
kubectl create ns observability

# Loki SingleBinary
helm install loki grafana/loki -n observability --version 6.16.0 -f monitoring/loki-values.yaml

# Alloy (log shipping)
helm install alloy grafana/alloy -n observability --version 0.9.2 -f monitoring/alloy-values.yaml

# Prometheus + Grafana + AlertManager
helm install kps prometheus-community/kube-prometheus-stack \
  -n observability --version 61.9.0 -f monitoring/prometheus-values.yaml
```

### 11. Tekton + Registry local + builds iniciales

```bash
# Registry local (NodePort 30500)
kubectl apply -f k8s/registry/

# Configurar containerd en CADA nodo para trust registry insecure
sudo mkdir -p /etc/containerd/certs.d/<MASTER-IP>:30500
sudo tee /etc/containerd/certs.d/<MASTER-IP>:30500/hosts.toml <<EOF
server = "http://<MASTER-IP>:30500"
[host."http://<MASTER-IP>:30500"]
  capabilities = ["pull", "resolve", "push"]
  skip_verify = true
EOF
sudo sed -i "s|config_path = ''|config_path = '/etc/containerd/certs.d'|g" /etc/containerd/config.toml
sudo systemctl restart containerd

# Tekton
kubectl apply -f https://storage.googleapis.com/tekton-releases/pipeline/previous/v0.65.0/release.yaml
kubectl apply -f tekton/

# Disparar primer build api + worker
kubectl create -f tekton/pipelinerun-api.yaml
kubectl create -f tekton/pipelinerun-worker.yaml
```

### 12. ArgoCD + Argo Rollouts

```bash
# ArgoCD
kubectl create ns argocd
kubectl apply -n argocd --server-side -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.11.7/manifests/install.yaml

# Argo Rollouts
kubectl create ns argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/download/v1.7.2/install.yaml

# kubectl plugin (en el master)
curl -LO https://github.com/argoproj/argo-rollouts/releases/download/v1.7.2/kubectl-argo-rollouts-linux-arm64
chmod +x kubectl-argo-rollouts-linux-arm64
sudo mv kubectl-argo-rollouts-linux-arm64 /usr/local/bin/kubectl-argo-rollouts
```

### 13. Secrets de la app (generados, no commiteados)

```bash
# Generar JWT keys + Mongo keyfile + passwords random
mkdir -p /tmp/secrets && cd /tmp/secrets
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
openssl rand -base64 756 > mongodb-keyfile
chmod 400 mongodb-keyfile jwt-private.pem

REDIS_PASS=$(openssl rand -base64 24 | tr -d '/+=')
MONGO_ROOT_PASS=$(openssl rand -base64 24 | tr -d '/+=')
MONGO_APP_PASS=$(openssl rand -base64 24 | tr -d '/+=')

kubectl create ns micrositio
kubectl create secret generic mongodb-keyfile -n micrositio --from-file=mongodb.key=mongodb-keyfile
kubectl create secret generic mongodb-users -n micrositio \
  --from-literal=MONGO_INITDB_ROOT_USERNAME=root \
  --from-literal=MONGO_INITDB_ROOT_PASSWORD="$MONGO_ROOT_PASS" \
  --from-literal=APP_USER=app --from-literal=APP_PASSWORD="$MONGO_APP_PASS"
kubectl create secret generic redis-auth -n micrositio --from-literal=REDIS_PASSWORD="$REDIS_PASS"
kubectl create secret generic api-jwt -n micrositio --from-file=jwt-private.pem --from-file=jwt-public.pem
kubectl create secret generic api-env -n micrositio \
  --from-literal=MONGODB_URI="mongodb://app:${MONGO_APP_PASS}@mongodb-0.mongodb-headless.micrositio.svc:27017,mongodb-1.mongodb-headless.micrositio.svc:27017,mongodb-2.mongodb-headless.micrositio.svc:27017/micrositio?replicaSet=rs0&authSource=micrositio" \
  --from-literal=REDIS_HOST=redis.micrositio.svc.cluster.local \
  --from-literal=REDIS_PORT=6379 \
  --from-literal=REDIS_PASSWORD="$REDIS_PASS" \
  --from-literal=JWT_PRIVATE_KEY_PATH=/secrets/jwt-private.pem \
  --from-literal=JWT_PUBLIC_KEY_PATH=/secrets/jwt-public.pem
```

### 14. Secret repo privado para ArgoCD

```bash
# Generar fine-grained PAT en GitHub: Contents Read, repo micrositio-pedidos
kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: repo-micrositio-pedidos
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
type: Opaque
stringData:
  type: git
  url: https://github.com/SEBASTIANCONTRERAS35/micrositio-pedidos
  username: x-access-token
  password: <GITHUB_PAT>
EOF
```

### 15. Aplicar ArgoCD Application (gestiona todo `k8s/`)

```bash
kubectl apply -f argocd/application.yaml

# Esperar Sync=Synced y Health=Healthy
kubectl get app micrositio -n argocd -w
```

### 16. Inicializar MongoDB Replica Set + crear usuarios

```bash
# Esperar mongodb-0/1/2 Ready, luego:
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet --eval '
rs.initiate({_id:"rs0",members:[
  {_id:0,host:"mongodb-0.mongodb-headless.micrositio.svc.cluster.local:27017",priority:2},
  {_id:1,host:"mongodb-1.mongodb-headless.micrositio.svc.cluster.local:27017",priority:1},
  {_id:2,host:"mongodb-2.mongodb-headless.micrositio.svc.cluster.local:27017",priority:1}
]})'

# Crear usuarios (localhost exception)
ROOT_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath="{.data.MONGO_INITDB_ROOT_PASSWORD}" | base64 -d)
APP_PASS=$(kubectl get secret mongodb-users -n micrositio -o jsonpath="{.data.APP_PASSWORD}" | base64 -d)
kubectl exec mongodb-0 -n micrositio -c mongodb -- mongosh --quiet -u root -p "$ROOT_PASS" --authenticationDatabase admin --eval "
use micrositio
db.createUser({user: 'app', pwd: '$APP_PASS', roles: [{role: 'readWrite', db: 'micrositio'}]})
"
```

### 17. Verificación final

```bash
# Todos los pods Running
kubectl get pods -n micrositio

# HTTPS funcionando
curl -k --resolve zuyu.local:443:<WORKER-IP> https://zuyu.local/health/live

# Sync ArgoCD
kubectl get app micrositio -n argocd
```

---

## Las 8 demos para la defensa

> Cada demo en `demos/demo-N-<nombre>.sh`. Total 20 min. Ordenadas según rubrica de Daniel Guerrero.

| #   | Demo                                      | Duración | Pts en juego        |
| --- | ----------------------------------------- | -------- | ------------------- |
| 1   | Flujo de pedido end-to-end                | 4 min    | 5 (App funcional)   |
| 2   | MongoDB Replica Set + matar PRIMARY       | 2 min    | 15 (MongoDB RS)     |
| 3   | NetworkPolicy bloqueando pod rogue        | 2 min    | 15 (NetworkPolicy)  |
| 4   | KEDA: scale-up 1→5 + scale-down           | 3 min    | 15 (KEDA)           |
| 5   | CI/CD: git push → Tekton → ArgoCD         | 3 min    | 15 (CI/CD)          |
| 6   | Canary 10% → 50% → 100% (Argo Rollouts)   | 2 min    | 10 (Canary)         |
| 7   | Búsqueda de pedido por `pedidoId` en Loki | 2 min    | 10 (Observabilidad) |
| 8   | Q&A                                       | 2 min    | —                   |

Demos implícitas que también hay que tener listas (Daniel puede pedirlas):

- Ingress + TLS (candado verde en `zuyu.local`)
- ResourceQuota (pod rechazado por exceso)
- AnalysisTemplate (rollback automático por error rate, bonus +3)

Correr cualquiera:

```bash
bash demos/demo-1-pedido-e2e.sh
```

---

## Desarrollo local (Docker Compose)

> Solo para desarrollo. La defensa se hace contra el cluster K8s real.

```bash
git clone git@github.com:SEBASTIANCONTRERAS35/micrositio-pedidos.git
cd micrositio-pedidos
cp .env.example .env  # editar con valores reales

docker compose up -d
docker compose logs -f api

# Abrir http://localhost:3000/tienda/demo
```

Tests:

```bash
npm install
npm test                  # unit
npm run test:integration  # integration (requiere mongo+redis vía testcontainers)
```

---

## Troubleshooting

| Síntoma                              | Causa probable                                           | Fix                                                                    |
| ------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Pod en `ImagePullBackOff`            | gcr.io 403 anonymous OR registry insecure no configurado | Verificar `/etc/containerd/certs.d/.../hosts.toml`, restart containerd |
| Pod-to-pod cross-node falla          | firewalld bloqueando vxlan.calico                        | `firewall-cmd --zone=trusted --add-interface=vxlan.calico`             |
| MongoDB `Authentication failed`      | Usuarios no creados                                      | Ejecutar paso 16 (localhost exception)                                 |
| ArgoCD `Sync=Unknown`                | argocd-repo-server caído                                 | `kubectl rollout restart deploy/argocd-repo-server -n argocd`          |
| MongoDB pod 0/1 Ready loop           | Readiness probe timeout muy corto                        | Ya parchado en repo (timeoutSeconds: 10)                               |
| KEDA ScaledObject no escala          | Netpol bloquea KEDA → Redis                              | `k8s/networkpolicy/allow-redis-from-keda.yaml` ya en repo              |
| Build Tekton falla `npm ci`          | Falta package-lock.json                                  | Repo usa workspaces, lockfile en root, Dockerfile actualizado          |
| Build Tekton falla `husky not found` | Script prepare requiere devDeps                          | Dockerfile usa `--ignore-scripts`                                      |

---

## Decisiones arquitectónicas

Ver `docs/adr/` para los ADRs completos. Resumen:

- **ADR-001:** Calico VXLAN (no Flannel) — NetworkPolicy completa requerida por rúbrica
- **ADR-002:** NFS para MongoDB es deuda técnica aceptable — demo OK, prod requeriría block storage
- **ADR-003:** Registry local in-cluster (no Docker Hub / ghcr.io) — evita rate limits y credenciales externas
- **ADR-004:** EJS + Alpine.js (no React) — stack que el alumno domina, foco en infra
- **ADR-005:** PSS baseline (no restricted) en `micrositio` ns — mongodb init container necesita root + CHOWN

---

## Créditos y licencia

Proyecto académico de la materia Introducción a DevOps.
Código MIT. Datos generados son sintéticos.
