# 📘 Módulo 4 (desde 0) — Objetos básicos de Kubernetes

> Estos son los "ladrillos" que escribes en YAML: Namespace, Pod, ConfigMap,
> Secret y RBAC. Todo lo demás (Deployments, etc.) se construye sobre esto.

## 4.1 Namespace (las carpetas del cluster)
Particiones lógicas para organizar y aislar. Tu app: namespace `micrositio`.
  kubectl get namespaces                         # listar carpetas
  kubectl create namespace pruebas               # crear una
  kubectl get pods -n micrositio                 # ver pods en una carpeta
  kubectl config set-context --current --namespace=micrositio  # carpeta por defecto

## 4.2 Pod (la unidad mínima)
Un Pod envuelve 1 (o más) contenedores. YAML mínimo:
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
  kubectl apply -f pod.yaml          # crear el pod
  kubectl get pods                   # ver estado (READY 1/1, STATUS Running)
  kubectl describe pod mi-pod        # detalle (mira Events al final si falla)
  kubectl logs mi-pod                # logs del contenedor
  kubectl exec -it mi-pod -- sh      # entrar al contenedor
  kubectl delete pod mi-pod          # borrar
Tipos especiales: init-container (corre ANTES, prepara algo) y sidecar (2do
contenedor auxiliar que corre junto, ej. logs).

## 4.3 ConfigMap (configuración NO secreta)
Guarda configuración para no meterla dentro de la imagen. Texto plano.
  kubectl create configmap app-config --from-literal=LOG_LEVEL=info
  kubectl create configmap app-config --from-file=config.properties
  kubectl get configmap
  kubectl describe configmap app-config
Usarlo en un Pod de 2 formas:
  # A) como variable de entorno
  env:
  - name: LOG_LEVEL
    valueFrom:
      configMapKeyRef: { name: app-config, key: LOG_LEVEL }
  # B) como archivo montado
  volumeMounts:
  - { name: cfg, mountPath: /etc/config }
  volumes:
  - name: cfg
    configMap: { name: app-config }

## 4.4 Secret (configuración SENSIBLE)
Igual que ConfigMap pero para datos confidenciales (contraseñas, tokens).
Se guardan en base64 (NO es cifrado, solo codificación).
  echo -n 'mipassword' | base64           # codificar
  echo -n 'bWlwYXNzd29yZA==' | base64 -d  # decodificar
  kubectl create secret generic db-secret --from-literal=password=mipass
  kubectl get secret db-secret -o yaml
Usarlo en un Pod:
  env:
  - name: DB_PASS
    valueFrom:
      secretKeyRef: { name: db-secret, key: password }
IMPORTANTE: base64 NO es seguro (cualquiera lo decodifica). En producción se
protege con RBAC y/o herramientas externas (en tu proyecto: SealedSecrets, módulo 9).

## 4.5 RBAC (quién puede hacer qué)
RBAC = Role-Based Access Control. Controla permisos dentro del cluster.
Piezas:
- ServiceAccount (SA): la "identidad" que usa un pod para hablar con el cluster.
- Role: una lista de permisos (ej. "leer pods en este namespace").
- RoleBinding: une un ServiceAccount con un Role (le da esos permisos).
  kubectl create serviceaccount mi-sa
  kubectl get serviceaccount
  kubectl auth can-i list pods --as=system:serviceaccount:micrositio:mi-sa
  # responde yes/no -> sirve para PROBAR permisos
Role + RoleBinding (YAML):
  kind: Role          # permisos
  rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get","list"]
  ---
  kind: RoleBinding   # asigna el Role a la SA
  subjects: [{ kind: ServiceAccount, name: mi-sa }]
  roleRef: { kind: Role, name: <role> }

## Lo que debes poder decir
- Namespace = carpeta; -n para elegirla.
- Pod = unidad mínima; apply/get/describe/logs/exec.
- ConfigMap = config no secreta (env o archivo). Secret = config secreta (base64).
- base64 NO es cifrado.
- RBAC = ServiceAccount (identidad) + Role (permisos) + RoleBinding (los une). auth can-i para probar.
