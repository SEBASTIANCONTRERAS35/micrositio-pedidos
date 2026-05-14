# Fase 6 — Observabilidad + Escalado · Checklist

> Loki + Grafana Alloy + Prometheus + KEDA.
> Días 16–17 (mié 28 mayo – jue 29 mayo).

## Lo que YO ya hice

- [x] `monitoring/loki-values.yaml` (chart `loki` SingleBinary, NO loki-stack que está deprecado)
- [x] `monitoring/alloy-values.yaml` (Grafana Alloy reemplaza Promtail; extrae `pedidoId` del JSON)
- [x] `monitoring/prometheus-values.yaml` (kube-prometheus-stack con Grafana)
- [x] `monitoring/alerts/api-and-queue.yaml` (PrometheusRule con 4 alertas — BONUS +2)
- [x] `k8s/worker/scaledobject-keda.yaml` (3 triggers: notificaciones, delivery, webhook-delivery)

## Lo que TÚ tienes que hacer

### 1. Instalar Loki
```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm install loki grafana/loki -f monitoring/loki-values.yaml -n monitoring --create-namespace
```

### 2. Instalar Grafana Alloy
```bash
helm install alloy grafana/alloy -f monitoring/alloy-values.yaml -n monitoring
```

### 3. Instalar kube-prometheus-stack
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack \
  -f monitoring/prometheus-values.yaml -n monitoring
```

### 4. Aplicar alertas (BONUS +2)
```bash
kubectl apply -f monitoring/alerts/api-and-queue.yaml
```

### 5. Instalar KEDA 2.19
```bash
helm repo add kedacore https://kedacore.github.io/charts
helm install keda kedacore/keda --version 2.19.0 -n keda --create-namespace
```

### 6. Aplicar ScaledObject del worker
```bash
kubectl apply -f k8s/worker/scaledobject-keda.yaml
```

### 7. Verificar Grafana
```bash
kubectl port-forward -n monitoring svc/prometheus-grafana 3001:80
# Abrir http://localhost:3001 (admin / admin-cambiar-en-produccion)
# Datasource Loki ya configurado
# Datasource Prometheus ya configurado
```

### 8. Probar búsqueda de pedido en Loki
```
1. Crear un pedido en https://zuyu.local/tienda/demo
2. Anotar el pedidoId
3. Grafana → Explore → Loki:
   {namespace="micrositio"} | json | pedidoId="PED-XXX"
```

### 9. Probar KEDA scale-up
```bash
./scripts/demo-4-keda-scale.sh
# Debe mostrar el worker escalando a 5 réplicas y luego volviendo a 1
```

## Checkpoint
✅ Loki recibe logs de api+worker
✅ Búsqueda por pedidoId regresa logs correlacionados
✅ Grafana muestra dashboards
✅ KEDA escala el worker arriba al encolar 50 jobs
✅ KEDA escala abajo cuando la cola se vacía
✅ Alertas Prometheus configuradas (BONUS +2)
