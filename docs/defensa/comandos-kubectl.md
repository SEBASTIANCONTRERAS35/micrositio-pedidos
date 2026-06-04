# 🧰 Chuleta de comandos kubectl (para la defensa)

> Tu namespace principal es `micrositio`. Casi todo lleva `-n micrositio`.
> Truco: `kubectl config set-context --current --namespace=micrositio`
> y ya no tienes que escribir `-n micrositio` cada vez.

## Banderas (flags) que se repiten — qué significan
- `-n <namespace>` → en qué carpeta buscar (ej. `-n micrositio`)
- `-A` → en TODOS los namespaces
- `-o wide` → más columnas (IP, nodo)
- `-o yaml` → muestra el objeto completo en YAML
- `-w` → "watch": se queda mirando y actualiza en vivo
- `-f archivo.yaml` → usa ese archivo
- `-l app=api` → filtra por etiqueta (label)

## 1. VER el estado
kubectl get nodes -o wide                  # máquinas del cluster
kubectl get pods -n micrositio             # pods de tu app
kubectl get pods -A                        # pods de TODO el cluster
kubectl get all -n micrositio              # pods+services+deployments de un ns
kubectl get svc -n micrositio              # services (las "puertas" de red)
kubectl get deploy -n micrositio           # deployments
kubectl get pvc -n micrositio              # discos persistentes
kubectl get ingress -n micrositio          # entradas HTTPS

## 2. DETALLE / por qué algo falla
kubectl describe pod <pod> -n micrositio   # eventos, estado, por qué no arranca
kubectl get events -n micrositio --sort-by=.lastTimestamp   # qué pasó (cronológico)

## 3. LOGS (los mensajes del contenedor)
kubectl logs <pod> -n micrositio           # logs de un pod
kubectl logs <pod> -n micrositio -f        # -f = seguir en vivo
kubectl logs -l app=api -n micrositio      # logs de TODOS los pods con label app=api
kubectl logs <pod> -n micrositio --previous # logs del contenedor ANTERIOR (si crasheó)

## 4. APLICAR / BORRAR (declarativo)
kubectl apply -f archivo.yaml              # crear/actualizar desde un YAML
kubectl apply -f carpeta/                  # aplicar todos los YAML de una carpeta
kubectl delete -f archivo.yaml             # borrar lo que define ese YAML
kubectl apply -f x.yaml --dry-run=server   # PROBAR sin aplicar (validar)

## 5. ENTRAR / EJECUTAR dentro de un contenedor
kubectl exec -it <pod> -n micrositio -- sh        # abrir una terminal dentro
kubectl exec <pod> -n micrositio -- env           # ver variables de entorno
kubectl exec <pod> -n micrositio -- curl localhost:3000/health  # probar desde adentro

## 6. ESCALAR / REINICIAR
kubectl scale deploy <nombre> --replicas=5 -n micrositio   # cambiar nº de copias
kubectl rollout restart deploy/<nombre> -n micrositio      # reiniciar pods limpio
kubectl rollout status deploy/<nombre> -n micrositio       # ver progreso

## 7. ACCESO desde tu laptop (para ver paneles)
kubectl port-forward -n observability svc/kps-grafana 3001:80   # Grafana en localhost:3001

## 8. Para la DEFENSA (demostraciones rápidas)
# Ver que hay 3 nodos vivos:
kubectl get nodes
# Ver todos los pods de la app corriendo:
kubectl get pods -n micrositio
# Ver que el MongoDB es Replica Set de 3:
kubectl get statefulset -n micrositio
# Ver las NetworkPolicies (seguridad):
kubectl get networkpolicy -n micrositio
# Ver el escalado automático (KEDA):
kubectl get scaledobject -n micrositio
# Ver el despliegue Canary:
kubectl get rollout -n micrositio
# Ver que ArgoCD tiene todo sincronizado:
kubectl get application -n argocd

## Comodín cuando algo falla en vivo
1. kubectl get pods -n micrositio          # ¿está Running?
2. kubectl describe pod <pod> -n micrositio # ¿qué dice en Events al final?
3. kubectl logs <pod> -n micrositio         # ¿qué error imprime?
Con esos 3 resuelves el 90% de los problemas en vivo.
