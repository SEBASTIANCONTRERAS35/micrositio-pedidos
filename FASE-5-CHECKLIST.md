# Fase 5 — Kubernetes Manifests + Network Security · Checklist

> Desplegar la app en el cluster con TLS y aislamiento de red.
> Días 12–15 (sáb 24 mayo – mar 27 mayo).

## Lo que YO ya hice (manifestos generados)

### k8s/api/
- [x] `serviceaccount.yaml` (api-sa, sin token)
- [x] `secret-env.example.yaml` (template con MongoDB URI, Redis, Resend, Twilio, carriers)
- [x] `secret-jwt.example.yaml` (template para par RSA)
- [x] `deployment.yaml` (2 replicas, securityContext Restricted, livenessProbe, readinessProbe, startupProbe)
- [x] `service.yaml` (ClusterIP)

### k8s/worker/
- [x] `serviceaccount.yaml`
- [x] `deployment.yaml` (1 réplica inicial, KEDA escala)
- [x] `scaledobject-keda.yaml` (3 triggers: notificaciones, delivery, webhook-delivery)

### k8s/networkpolicy/ (las 7 + 2 adicionales)
- [x] `default-deny-all.yaml`
- [x] `allow-dns.yaml`
- [x] `allow-api-to-mongo.yaml` (api → mongo Y mongo acepta de api+worker)
- [x] `allow-worker-to-mongo.yaml`
- [x] `allow-redis.yaml` (api+worker → redis Y redis acepta de api+worker)
- [x] `allow-ingress-to-api.yaml`
- [x] `allow-egress-internet.yaml` (carriers/Resend/Twilio, bloqueando RFC1918)

### k8s/cert-manager/
- [x] `cluster-issuer-selfsigned.yaml`
- [x] `certificate-root-ca.yaml`
- [x] `cluster-issuer-ca.yaml`

### k8s/rollouts/
- [x] `api-rollout.yaml` (Canary 10→50→100% con AnalysisTemplate)
- [x] `analysis-template.yaml` (BONUS +3, query Prometheus error rate)

### k8s/
- [x] `ingress.yaml` (zuyu.local + TLS via cert-manager CA)

## Lo que TÚ tienes que hacer

### 1. Build y push de las imágenes a Docker Hub
```bash
docker login
docker build --target production -t SEBASTIANCONTRERAS35/micrositio-api:v0.1 ./api
docker push SEBASTIANCONTRERAS35/micrositio-api:v0.1
docker tag SEBASTIANCONTRERAS35/micrositio-api:v0.1 SEBASTIANCONTRERAS35/micrositio-api:latest
docker push SEBASTIANCONTRERAS35/micrositio-api:latest

docker build --target production -t SEBASTIANCONTRERAS35/micrositio-worker:v0.1 ./worker
docker push SEBASTIANCONTRERAS35/micrositio-worker:v0.1
docker push SEBASTIANCONTRERAS35/micrositio-worker:latest
```

### 2. Sellar los Secrets reales con kubeseal
```bash
# JWT key pair
openssl genrsa -out /tmp/jwt-private.pem 2048
openssl rsa -in /tmp/jwt-private.pem -pubout -out /tmp/jwt-public.pem

kubectl create secret generic api-jwt \
  --from-file=jwt-private.pem=/tmp/jwt-private.pem \
  --from-file=jwt-public.pem=/tmp/jwt-public.pem \
  -n micrositio --dry-run=client -o yaml | \
  kubeseal --cert /tmp/sealed-secrets-cert.pem -o yaml \
  > k8s/api/secret-jwt.sealedsecret.yaml

# Editar k8s/api/secret-env.example.yaml con los passwords reales y sellar
kubectl create secret generic api-env \
  --from-env-file=/tmp/api-env.env \
  -n micrositio --dry-run=client -o yaml | \
  kubeseal --cert /tmp/sealed-secrets-cert.pem -o yaml \
  > k8s/api/secret-env.sealedsecret.yaml

rm /tmp/jwt-*.pem /tmp/api-env.env
```

### 3. Aplicar manifestos en orden
```bash
kubectl apply -f k8s/api/serviceaccount.yaml
kubectl apply -f k8s/api/secret-jwt.sealedsecret.yaml
kubectl apply -f k8s/api/secret-env.sealedsecret.yaml
kubectl apply -f k8s/api/deployment.yaml  # O rollouts/api-rollout.yaml
kubectl apply -f k8s/api/service.yaml

kubectl apply -f k8s/worker/serviceaccount.yaml
kubectl apply -f k8s/worker/deployment.yaml

# NetworkPolicies (al final, despues de tener pods Running)
kubectl apply -f k8s/networkpolicy/

# Ingress
kubectl apply -f k8s/ingress.yaml
```

### 4. Configurar /etc/hosts
```bash
# IP del nginx-ingress controller
INGRESS_IP=$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.spec.clusterIP}')
echo "$INGRESS_IP zuyu.local" | sudo tee -a /etc/hosts
```

### 5. CRÍTICO: Importar CA raíz en el browser de demo
```bash
kubectl get secret root-ca -n cert-manager -o jsonpath='{.data.ca\.crt}' | base64 -d > ~/Desktop/ca.crt

# Chrome: Settings → Privacy → Manage certificates → Authorities → Import → ca.crt
# Marcar "Trust this certificate for identifying websites"
```

### 6. Verificar
```bash
# HTTPS con candado verde (sin warnings)
curl -k https://zuyu.local/health/ready

# NetworkPolicy: pod rogue debe ser bloqueado
./scripts/demo-3-network-policy.sh
```

## Checkpoint
✅ Imágenes en Docker Hub
✅ Secrets sellados aplicados al cluster
✅ Pods api+worker Running
✅ HTTPS funcionando con candado verde
✅ Pod rogue bloqueado por NetworkPolicy
✅ Ingress responde 200 en /health/ready
