# 📘 Módulo 4 (desde 0) — Objetos básicos de Kubernetes

> Estos son los "ladrillos" que escribes en YAML: Namespace, Pod, ConfigMap,
> Secret y RBAC (ServiceAccount/Role). El profe los vio en la Clase 1 y ejercicios.

## Estructura de TODO YAML de Kubernetes
Todo objeto tiene 4 partes:
  apiVersion: v1          # qué versión de la API
  kind: Pod               # qué tipo de objeto
  metadata:               # datos: nombre, namespace, labels
    name: mi-pod
  spec:                   # la "especificación": cómo lo quieres
    ...

## 4.1 Namespace (carpeta)
Divide el cluster en secciones lógicas. Tu app vive en "micrositio".
  apiVersion: v1
  kind: Namespace
  metadata:
    name: micrositio
Comandos:
  kubectl get namespaces                 # listar carpetas
  kubectl create namespace prueba        # crear una
  kubectl get pods -n micrositio         # ver pods en una carpeta

## 4.2 Pod (la cajita del contenedor)
  apiVersion: v1
  kind: Pod
  metadata:
    name: mi-pod
    labels:
      app: web
  spec:
    containers:
    - name: nginx
      image: nginx:1.25
      ports:
      - containerPort: 80
Comandos:
  kubectl apply -f pod.yaml
  kubectl get pods
  kubectl describe pod mi-pod            # detalle (eventos al final)
  kubectl logs mi-pod
  kubectl exec -it mi-pod -- sh
  kubectl delete pod mi-pod

## 4.3 ConfigMap (configuración NO sensible)
Guarda configuración (texto) separada del código. Ej: nivel de log, nombre de app.
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: app-config
  data:
    APP_ENV: "produccion"
    LOG_LEVEL: "info"
Usarlo en un Pod (como variable de entorno):
  env:
  - name: LOG_LEVEL
    valueFrom:
      configMapKeyRef:
        name: app-config
        key: LOG_LEVEL
  # o cargar TODAS las claves de golpe:
  envFrom:
  - configMapRef:
      name: app-config
Comandos:
  kubectl create configmap app-config --from-literal=LOG_LEVEL=info
  kubectl get configmap
  kubectl describe configmap app-config

## 4.4 Secret (configuración SENSIBLE)
Igual que ConfigMap pero para datos secretos (contraseñas, llaves).
Los valores van en base64 (NO es cifrado, solo codificación).
  echo -n 'mipassword' | base64    # codificar -> bWlwYXNzd29yZA==
  echo -n 'bWlwYXNzd29yZA==' | base64 -d   # decodificar
  apiVersion: v1
  kind: Secret
  metadata:
    name: db-secret
  type: Opaque
  data:
    password: bWlwYXNzd29yZA==
Usarlo en un Pod:
  env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: db-secret
        key: password
Comandos:
  kubectl create secret generic db-secret --from-literal=password=mipassword
  kubectl get secrets
  kubectl get secret db-secret -o jsonpath='{.data.password}' | base64 -d   # leer

IMPORTANTE: base64 NO es seguridad. Para producción se cifra (en tu proyecto:
SealedSecrets, lo verás en el Módulo 9).

## 4.5 RBAC — quién puede hacer qué
RBAC = Role-Based Access Control (control de acceso por roles).
3 piezas:
- ServiceAccount = la "identidad" de un pod (su cuenta).
- Role = un permiso ("puede listar pods en este namespace").
- RoleBinding = une la ServiceAccount con el Role ("a esta cuenta dale ese permiso").

  apiVersion: v1
  kind: ServiceAccount
  metadata:
    name: mi-sa
  ---
  apiVersion: rbac.authorization.k8s.io/v1
  kind: Role
  metadata:
    name: lector-pods
  rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]
  ---
  apiVersion: rbac.authorization.k8s.io/v1
  kind: RoleBinding
  metadata:
    name: dar-lectura
  subjects:
  - kind: ServiceAccount
    name: mi-sa
  roleRef:
    kind: Role
    name: lector-pods
    apiGroup: rbac.authorization.k8s.io

Comandos:
  kubectl get serviceaccount
  kubectl get role,rolebinding
  kubectl auth can-i list pods --as=system:serviceaccount:micrositio:mi-sa
  # responde "yes" o "no": ¿esta cuenta PUEDE hacer esto?

## Lo que debes poder decir
- Todo YAML: apiVersion, kind, metadata, spec.
- Namespace = carpeta. Pod = cajita del contenedor.
- ConfigMap = config no sensible; Secret = sensible (base64, NO cifrado).
- env (una variable) vs envFrom (todas).
- RBAC = ServiceAccount (identidad) + Role (permiso) + RoleBinding (los une).
- `kubectl auth can-i` = comprobar permisos.
