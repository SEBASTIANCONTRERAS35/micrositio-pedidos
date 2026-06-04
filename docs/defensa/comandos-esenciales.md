# 🧰 Comandos esenciales de kubectl (desde 0)

> kubectl = el comando para hablarle al cluster. Todo empieza con `kubectl`.
> Banderas que verás siempre:
>   -n <namespace>  → en qué carpeta mirar (ej: -n micrositio)
>   -o wide         → muestra MÁS columnas (IP, nodo)
>   -w              → "watch": se queda mirando en vivo los cambios
>   -A              → en TODOS los namespaces

## 1. Ver las máquinas del cluster
kubectl get nodes                 # lista master y workers
kubectl get nodes -o wide         # + IP, sistema operativo, versión

## 2. Ver los contenedores (pods)
kubectl get pods -n micrositio              # pods de tu app
kubectl get pods -n micrositio -o wide      # + en qué worker y qué IP
kubectl get pods -A                         # pods de TODO el cluster
kubectl get pods -n micrositio -w           # ver en vivo cómo cambian

## 3. Ver el detalle / por qué algo falla
kubectl describe pod <nombre> -n micrositio # estado, eventos, errores
kubectl get events -n micrositio --sort-by=.lastTimestamp  # últimos eventos

## 4. Ver los logs (mensajes) de un contenedor
kubectl logs <pod> -n micrositio            # logs de ese pod
kubectl logs <pod> -n micrositio -f         # -f = seguir en vivo
kubectl logs deploy/api -n micrositio       # logs del deployment "api"

## 5. Entrar a un contenedor (como SSH)
kubectl exec -it <pod> -n micrositio -- sh  # abre una shell dentro
# Adentro puedes correr: ls, cat archivo, env, etc. Sales con: exit

## 6. Aplicar / borrar / editar (el "papel" YAML)
kubectl apply -f archivo.yaml               # crear o actualizar (lo que quieres)
kubectl apply -f carpeta/                    # aplicar TODA una carpeta
kubectl delete -f archivo.yaml               # borrar lo de ese archivo
kubectl delete pod <nombre> -n micrositio    # borrar un pod (K8s crea otro)
kubectl edit deploy api -n micrositio        # editar en vivo (abre editor)

## 7. Ver "TODO" de un namespace
kubectl get all -n micrositio                # pods, services, deployments...

## 8. Otros objetos importantes (ver más adelante en los módulos)
kubectl get svc -n micrositio                # services (redes)
kubectl get deploy -n micrositio             # deployments
kubectl get pvc -n micrositio                # almacenamiento (claims)
kubectl get configmap -n micrositio          # configuraciones
kubectl get secret -n micrositio             # secretos
kubectl get networkpolicy -n micrositio      # políticas de red
kubectl get ns                               # listar namespaces

## 9. Trucos para la defensa
kubectl config set-context --current --namespace=micrositio
  # → te fija el namespace para no escribir -n cada vez

kubectl get pods -n micrositio | grep api    # filtrar por texto
kubectl top nodes                            # uso de CPU/RAM por nodo
kubectl top pods -n micrositio               # uso de CPU/RAM por pod

## Patrón mental
1. ¿Está corriendo?      → kubectl get pods
2. ¿Por qué falla?        → kubectl describe pod  +  kubectl logs
3. ¿Necesito entrar?      → kubectl exec -it ... -- sh
4. Quiero crear/cambiar   → kubectl apply -f
