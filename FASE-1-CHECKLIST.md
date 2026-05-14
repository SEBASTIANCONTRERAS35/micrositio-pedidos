# Fase 1 — Cluster + Bases de Datos · Checklist

> Esta fase levanta el cluster Kubernetes y las bases de datos (MongoDB Replica Set + Redis).
> Días 2–4 (mié 14 mayo – vie 16 mayo).

---

## Lo que YO ya hice (manifestos generados)

- [x] `k8s/namespace.yaml` con Pod Security Standards: Restricted enforced
- [x] `k8s/mongodb/serviceaccount.yaml`
- [x] `k8s/mongodb/secret-keyfile.example.yaml` (template, debes generar el real)
- [x] `k8s/mongodb/secret-users.example.yaml` (template, debes editar passwords)
- [x] `k8s/mongodb/service-headless.yaml` (clusterIP: None)
- [x] `k8s/mongodb/statefulset.yaml` (3 nodos, auth, keyfile, securityContext Restricted)
- [x] `k8s/mongodb/init-replica-set-job.yaml` (rs.initiate + crear usuarios app/worker)
- [x] `k8s/redis/secret-auth.example.yaml` (template)
- [x] `k8s/redis/configmap.yaml` (auth, FLUSHDB deshabilitado, AOF persistence)
- [x] `k8s/redis/serviceaccount.yaml`
- [x] `k8s/redis/pvc.yaml` (1Gi en nfs-csi)
- [x] `k8s/redis/deployment.yaml` (single replica + securityContext Restricted)
- [x] `k8s/redis/service.yaml`
- [x] `k8s/cert-manager/cluster-issuer-selfsigned.yaml`
- [x] `k8s/cert-manager/certificate-root-ca.yaml`
- [x] `k8s/cert-manager/cluster-issuer-ca.yaml`
- [x] `k8s/resourcequota/quota.yaml`
- [x] `k8s/resourcequota/limitrange.yaml`

---

## Lo que TÚ tienes que hacer manualmente (en este orden)

### 1. Levantar el cluster Kubernetes (en las VMs)

#### En el master node (Rocky Linux 9):

```bash
# Pre-requisitos
sudo dnf install -y kubeadm kubelet kubectl
sudo systemctl enable --now kubelet

# Inicializar
sudo kubeadm init \
  --pod-network-cidr=192.168.0.0/16 \
  --apiserver-advertise-address=$(hostname -i)

# Configurar kubectl para tu user
mkdir -p ~/.kube
sudo cp -i /etc/kubernetes/admin.conf ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config

# Guardar el comando join que muestra al final:
# Ej: kubeadm join 10.0.0.1:6443 --token abc.xyz --discovery-token-ca-cert-hash sha256:...
```

#### En cada worker node (2 workers):

```bash
sudo kubeadm join <master-ip>:6443 --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash>
```

#### Verificar (en master):

```bash
kubectl get nodes
# Esperado: 3 nodos NotReady (necesitan CNI)
```

---

### 2. Instalar Calico CNI

```bash
# IMPORTANTE: Calico, NO Canal (Canal fue archivado en Oct 2025)
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.29.3/manifests/calico.yaml

# Esperar ~2 min y verificar
kubectl get nodes
# Esperado: 3 nodos Ready

kubectl get pods -n kube-system | grep calico
# Esperado: calico-kube-controllers + calico-node x3 todos Running
```

---

### 3. Configurar acceso al NFS server (192.168.109.210)

Verificar que el NFS server existe y tiene un export disponible (esto lo provee Daniel/laboratorio):

```bash
# Desde un worker, probar mount
sudo mount -t nfs 192.168.109.210:/nfs-share /mnt/test
ls /mnt/test
sudo umount /mnt/test
```

---

### 4. Instalar csi-driver-nfs

```bash
# Instalar el CSI driver
helm repo add csi-driver-nfs https://raw.githubusercontent.com/kubernetes-csi/csi-driver-nfs/master/charts
helm install csi-driver-nfs csi-driver-nfs/csi-driver-nfs \
  --namespace kube-system \
  --version v4.9.0

# Crear StorageClass nfs-csi (ajusta el path del NFS export)
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: nfs-csi
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: nfs.csi.k8s.io
parameters:
  server: 192.168.109.210
  share: /nfs-share
  subDir: \${pvc.metadata.namespace}/\${pvc.metadata.name}
reclaimPolicy: Retain
volumeBindingMode: Immediate
mountOptions:
  - nfsvers=4.1
  - hard
EOF

# Verificar
kubectl get storageclass
# Esperado: nfs-csi (default)
```

---

### 5. Instalar cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.2/cert-manager.yaml

# Esperar ~30s y verificar
kubectl get pods -n cert-manager
# Esperado: cert-manager + cainjector + webhook todos Running

# Aplicar nuestros ClusterIssuers
kubectl apply -f k8s/cert-manager/cluster-issuer-selfsigned.yaml
kubectl apply -f k8s/cert-manager/certificate-root-ca.yaml
kubectl apply -f k8s/cert-manager/cluster-issuer-ca.yaml

# Verificar que el CA raiz se creo
kubectl get certificate -n cert-manager
# Esperado: root-ca con Ready=True
```

---

### 6. Instalar Sealed Secrets controller

```bash
# Instalar el controller
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets \
  --namespace kube-system \
  --version 2.16.2

# Instalar kubeseal CLI (en tu laptop)
brew install kubeseal  # macOS
# O: https://github.com/bitnami-labs/sealed-secrets/releases

# Obtener el cert publico para encriptar localmente
kubeseal --fetch-cert \
  --controller-name=sealed-secrets \
  --controller-namespace=kube-system \
  > /tmp/sealed-secrets-cert.pem
```

---

### 7. Crear el namespace

```bash
kubectl apply -f k8s/namespace.yaml
kubectl get namespace micrositio
# Esperado: con label pod-security.kubernetes.io/enforce=restricted
```

---

### 8. Crear y aplicar el ResourceQuota

```bash
kubectl apply -f k8s/resourcequota/quota.yaml
kubectl apply -f k8s/resourcequota/limitrange.yaml

# Verificar
kubectl get resourcequota -n micrositio
kubectl get limitrange -n micrositio
```

---

### 9. Generar secrets reales de MongoDB y sellarlos

```bash
# Keyfile para Replica Set
openssl rand -base64 756 > /tmp/mongodb-keyfile

kubectl create secret generic mongodb-keyfile \
  --from-file=mongodb.key=/tmp/mongodb-keyfile \
  -n micrositio --dry-run=client -o yaml | \
  kubeseal --cert /tmp/sealed-secrets-cert.pem -o yaml \
  > k8s/mongodb/secret-keyfile.sealedsecret.yaml

# Usuarios
ROOT_PASS=$(openssl rand -base64 32)
APP_PASS=$(openssl rand -base64 32)
WORKER_PASS=$(openssl rand -base64 32)

kubectl create secret generic mongodb-users \
  --from-literal=MONGO_INITDB_ROOT_USERNAME=root \
  --from-literal=MONGO_INITDB_ROOT_PASSWORD="$ROOT_PASS" \
  --from-literal=APP_USER=app \
  --from-literal=APP_PASSWORD="$APP_PASS" \
  --from-literal=WORKER_USER=worker \
  --from-literal=WORKER_PASSWORD="$WORKER_PASS" \
  -n micrositio --dry-run=client -o yaml | \
  kubeseal --cert /tmp/sealed-secrets-cert.pem -o yaml \
  > k8s/mongodb/secret-users.sealedsecret.yaml

# IMPORTANTE: guarda los passwords en un password manager
# Los necesitarás para conectar el api/worker a MongoDB
echo "ROOT: $ROOT_PASS"
echo "APP: $APP_PASS"
echo "WORKER: $WORKER_PASS"

# Aplicar los SealedSecrets
kubectl apply -f k8s/mongodb/secret-keyfile.sealedsecret.yaml
kubectl apply -f k8s/mongodb/secret-users.sealedsecret.yaml

# Limpiar archivos temporales
rm /tmp/mongodb-keyfile
```

---

### 10. Generar secret real de Redis y sellarlo

```bash
REDIS_PASS=$(openssl rand -base64 32)
APP_REDIS_PASS=$(openssl rand -base64 32)
WORKER_REDIS_PASS=$(openssl rand -base64 32)

kubectl create secret generic redis-auth \
  --from-literal=REDIS_PASSWORD="$REDIS_PASS" \
  --from-literal=REDIS_APP_PASSWORD="$APP_REDIS_PASS" \
  --from-literal=REDIS_WORKER_PASSWORD="$WORKER_REDIS_PASS" \
  -n micrositio --dry-run=client -o yaml | \
  kubeseal --cert /tmp/sealed-secrets-cert.pem -o yaml \
  > k8s/redis/secret-auth.sealedsecret.yaml

echo "REDIS: $REDIS_PASS"

kubectl apply -f k8s/redis/secret-auth.sealedsecret.yaml
```

---

### 11. Desplegar MongoDB

```bash
kubectl apply -f k8s/mongodb/serviceaccount.yaml
kubectl apply -f k8s/mongodb/service-headless.yaml
kubectl apply -f k8s/mongodb/statefulset.yaml

# Esperar a que los 3 pods estén Running (puede tomar 2-3 min la primera vez)
kubectl get pods -n micrositio -l app=mongodb -w
# Esperado: mongodb-0, mongodb-1, mongodb-2 todos Running

# Inicializar Replica Set
kubectl apply -f k8s/mongodb/init-replica-set-job.yaml

# Ver logs del job (debe terminar exitoso)
kubectl logs -n micrositio job/mongodb-init -f

# Verificar Replica Set funcionando
kubectl exec -it mongodb-0 -n micrositio -- mongosh \
  -u root -p "$ROOT_PASS" --authenticationDatabase admin \
  --eval "rs.status()"
# Esperado: members con 1 PRIMARY y 2 SECONDARY
```

---

### 12. Desplegar Redis

```bash
kubectl apply -f k8s/redis/serviceaccount.yaml
kubectl apply -f k8s/redis/configmap.yaml
kubectl apply -f k8s/redis/pvc.yaml
kubectl apply -f k8s/redis/deployment.yaml
kubectl apply -f k8s/redis/service.yaml

# Verificar
kubectl get pods -n micrositio -l app=redis
# Esperado: redis-xxx Running

# Probar AUTH
kubectl exec -it deploy/redis -n micrositio -- \
  sh -c "redis-cli -a $REDIS_PASS ping"
# Esperado: PONG

# Probar que comandos peligrosos están deshabilitados
kubectl exec -it deploy/redis -n micrositio -- \
  sh -c "redis-cli -a $REDIS_PASS FLUSHDB"
# Esperado: (error) ERR unknown command 'FLUSHDB'
```

---

## Smoke tests críticos (para checkpoint)

### Test 1: Replica Set con 1 PRIMARY + 2 SECONDARY
```bash
kubectl exec -it mongodb-0 -n micrositio -- mongosh -u root -p "$ROOT_PASS" --authenticationDatabase admin --eval "
  rs.status().members.forEach(m => print(m.name + ': ' + m.stateStr));
"
# Esperado:
#   mongodb-0.mongodb-headless.micrositio.svc:27017: PRIMARY
#   mongodb-1.mongodb-headless.micrositio.svc:27017: SECONDARY
#   mongodb-2.mongodb-headless.micrositio.svc:27017: SECONDARY
```

### Test 2: Usuario `app` puede leer/escribir en `micrositio` pero NO crear users
```bash
kubectl exec -it mongodb-0 -n micrositio -- mongosh \
  -u app -p "$APP_PASS" --authenticationDatabase micrositio --eval "
    use micrositio;
    db.test.insertOne({hello: 'world'});  // OK
    db.createUser({user: 'hacker', pwd: 'x', roles: ['root']});  // Debe fallar
"
# Esperado: insertOne OK, createUser falla con 'not authorized'
```

### Test 3: Redis con AUTH y comandos peligrosos bloqueados
```bash
kubectl exec -it deploy/redis -n micrositio -- sh -c "redis-cli -a $REDIS_PASS PING"
# Esperado: PONG

kubectl exec -it deploy/redis -n micrositio -- sh -c "redis-cli -a $REDIS_PASS FLUSHALL"
# Esperado: error (comando deshabilitado)
```

### Test 4: PVCs creados con nfs-csi
```bash
kubectl get pvc -n micrositio
# Esperado: data-mongodb-0, data-mongodb-1, data-mongodb-2, redis-data
# Todos en estado Bound
```

---

## Si algo sale mal — Troubleshooting

### MongoDB pod en CrashLoopBackOff
```bash
kubectl logs mongodb-0 -n micrositio --previous
# Causa común: keyfile permissions
# Fix: revisa el initContainer 'copy-keyfile' en statefulset.yaml
```

### NFS file locking error con MongoDB en K8s 1.24+
```bash
# En cada worker node (SSH):
sudo systemctl start rpc-statd
sudo systemctl enable rpc-statd
```

### PVCs en estado Pending
```bash
kubectl describe pvc data-mongodb-0 -n micrositio
# Causa común: nfs-csi no instalado o StorageClass mal configurado
```

### Redis no acepta conexiones
```bash
# Verificar que el password en el Secret coincide con el que usas
kubectl get secret redis-auth -n micrositio -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d
```

---

## Checkpoint final de Fase 1

✅ **PASA si**:
- `kubectl get nodes` muestra 3 Ready
- `kubectl get pods -n micrositio` muestra mongodb-0/1/2 + redis Running
- `rs.status()` muestra 1 PRIMARY + 2 SECONDARY
- `redis-cli -a $PASS PING` regresa PONG
- `kubectl get pvc -n micrositio` muestra todos Bound
- Comando peligroso de Redis (FLUSHDB) está deshabilitado

🔴 **FALLA si**:
- Algún pod en CrashLoopBackOff
- Replica Set no se inicializó (rs.status() da error)
- Algún PVC en Pending
- Auth de MongoDB o Redis no funciona

---

## Lo que viene en Fase 2

- Generar el código del API (Express + middlewares + auth + Pino)
- Generar el código del worker
- Tests baseline (Vitest)
- Build local de imágenes Docker
- Push a Docker Hub (cuenta personal)
- Primer deploy del api+worker en K8s

---

## Tiempo estimado total Fase 1
- Mi parte: ya hecha (manifestos generados)
- Tu parte: ~6 horas distribuidas en 3 días
