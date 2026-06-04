# 📘 Módulo 5 (desde 0) — Workloads (Deployment, DaemonSet, StatefulSet)

> Un "workload" es una forma de correr Pods con superpoderes (réplicas,
> auto-reparación, identidad). Casi nunca creas Pods sueltos; usas estos.

## 5.1 ¿Por qué no usar Pods sueltos?
Un Pod suelto, si muere, NO se recrea. Por eso usas controladores que mantienen
los Pods vivos mediante reconciliación. Los 3 principales: Deployment, DaemonSet,
StatefulSet.

## 5.2 Deployment (el más usado)
Gestiona Pods STATELESS (sin estado/datos propios). Garantiza N réplicas y permite
actualizar sin downtime.
  apiVersion: apps/v1
  kind: Deployment
  metadata: { name: web }
  spec:
    replicas: 3                 # quiero 3 copias siempre
    selector:
      matchLabels: { app: web } # qué pods son míos (por etiqueta)
    template:                   # la plantilla del Pod a crear
      metadata:
        labels: { app: web }    # DEBE coincidir con el selector
      spec:
        containers:
        - name: nginx
          image: nginx:1.25
Comandos:
  kubectl apply -f deploy.yaml
  kubectl get deploy                       # ver deployments (READY 3/3)
  kubectl get pods -l app=web              # ver sus pods
  kubectl scale deploy web --replicas=5    # cambiar nº de copias
  kubectl rollout status deploy/web        # ver progreso de una actualización
  kubectl rollout restart deploy/web       # reiniciar pods limpio
  kubectl rollout undo deploy/web          # deshacer (volver a versión anterior)

Por dentro: Deployment -> crea un ReplicaSet -> el ReplicaSet mantiene los Pods.
RollingUpdate: al actualizar, crea pods nuevos y borra viejos POCO A POCO (sin downtime).
  maxSurge: 1        # cuántos extra puede crear de más
  maxUnavailable: 0  # cuántos puede tener caídos (0 = cero downtime)

## 5.3 DaemonSet (1 pod por nodo)
Pone EXACTAMENTE 1 pod en CADA nodo. Para agentes del sistema (logs, métricas).
Si agregas un nodo, automáticamente le pone su pod.
  kind: DaemonSet
  ... (sin "replicas": es 1 por nodo, automático)
Comandos:
  kubectl get daemonset -A
  kubectl get pods -l app=monitor -o wide   # ver 1 por nodo
Uso típico: node-exporter (métricas de cada nodo), recolectores de logs.

## 5.4 StatefulSet (identidad estable)
Para apps CON ESTADO (bases de datos). Diferencias vs Deployment:
- Nombres predecibles: web-0, web-1, web-2 (no aleatorios).
- Creación en ORDEN: 0, luego 1, luego 2.
- Cada pod tiene su PROPIO disco persistente (volumeClaimTemplates).
- DNS estable por pod (web-0.servicio).
Necesita un "headless service" (Service sin IP, clusterIP: None) para el DNS.
  kind: StatefulSet
  spec:
    serviceName: web-svc
    replicas: 3
    volumeClaimTemplates:        # crea 1 disco por pod automáticamente
    - metadata: { name: datos }
      spec:
        accessModes: ["ReadWriteOnce"]
        resources: { requests: { storage: 5Gi } }
Comandos:
  kubectl get statefulset
  kubectl get pods -l app=web      # verás web-0, web-1, web-2
  kubectl get pvc                  # un disco por pod: datos-web-0, datos-web-1...
OJO: al reducir réplicas, los discos (PVC) NO se borran (protege tus datos).

## Tabla rápida
  Deployment  -> apps stateless, réplicas iguales y desechables
  DaemonSet   -> 1 por nodo (agentes)
  StatefulSet -> apps con estado, identidad y disco propio por pod (bases de datos)

## Lo que debes poder decir
- Deployment mantiene N réplicas + RollingUpdate sin downtime (ReplicaSet por dentro).
- DaemonSet = 1 pod por nodo (monitoreo/logs).
- StatefulSet = identidad estable + disco propio (bases de datos), necesita headless service.
- maxUnavailable: 0 = cero downtime.
