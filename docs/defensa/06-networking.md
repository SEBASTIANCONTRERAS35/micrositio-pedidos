# 📘 Módulo 6 (desde 0) — Networking (Services, Ingress, NetworkPolicy)

> El problema: los Pods cambian de IP al recrearse. Necesitamos una forma
> ESTABLE de alcanzarlos, exponerlos a internet, y controlar quién habla con quién.

## 6.1 El problema que resuelve el Service
Un Pod es desechable: al recrearse tiene OTRA IP. Si tu app le habla por IP, se rompe.
El SERVICE es una "puerta" con IP/nombre ESTABLE delante de un grupo de Pods.
Encuentra sus Pods por etiqueta (selector). Reparte el tráfico entre ellos (balanceo).

## 6.2 Tipos de Service
- ClusterIP (default): IP interna. Solo accesible DENTRO del cluster. (microservicios)
- NodePort: abre un puerto (30000-32767) en CADA nodo. Acceso desde afuera por IP-del-nodo:puerto.
- LoadBalancer: pide un balanceador externo (en la nube: AWS/GCP). IP pública.
- Headless (clusterIP: None): SIN IP propia; da DNS a cada pod individual (para StatefulSet).

YAML de un Service:
  apiVersion: v1
  kind: Service
  metadata: { name: web-svc }
  spec:
    type: ClusterIP
    selector: { app: web }     # a qué pods manda (por etiqueta)
    ports:
    - port: 80                 # puerto del service
      targetPort: 8080         # puerto del contenedor

Comandos:
  kubectl get svc -n micrositio
  kubectl describe svc web-svc
  kubectl get endpoints web-svc      # a qué IPs de pods apunta realmente

## 6.3 DNS interno (hablar por nombre)
Cada Service tiene un nombre DNS: <servicio>.<namespace>.svc.cluster.local
Dentro del cluster, tu app llama a "mongodb" o "redis" por NOMBRE, no por IP.
  # desde un pod:
  curl http://web-svc:80
  nslookup web-svc

## 6.4 Ingress + TLS (entrada HTTPS desde internet)
NodePort es feo (puertos raros). Para webs reales usas un INGRESS:
- Ingress = regla de enrutamiento HTTP/HTTPS por nombre de dominio.
  "zuyu.local -> manda al service api". Una sola entrada para muchos servicios.
- Necesita un "Ingress Controller" (nginx) que ejecuta esas reglas.
TLS = el candado HTTPS. Necesita un CERTIFICADO.
- cert-manager = herramienta que EMITE y RENUEVA certificados automáticamente.
- ClusterIssuer = quién firma los certificados (una CA propia self-signed).
- Certificate = pide un certificado para un dominio; se guarda en un Secret.

  kind: Ingress
  spec:
    ingressClassName: nginx
    tls:
    - hosts: [zuyu.local]
      secretName: zuyu-local-tls    # el cert vive aquí
    rules:
    - host: zuyu.local
      http:
        paths:
        - path: /
          backend: { service: { name: api, port: { number: 80 } } }

Comandos:
  kubectl get ingress -n micrositio
  kubectl get certificate -n micrositio       # ready=True si el cert se emitió
  kubectl get clusterissuer                    # quién firma

## 6.5 NetworkPolicy (firewall entre pods) — 15 pts en tu rúbrica
Por defecto en K8s TODOS los pods pueden hablar con TODOS (inseguro).
Una NetworkPolicy = reglas de quién PUEDE hablar con quién.
Estrategia correcta (la que pide el profe):
1. default-deny: bloquear TODO primero.
2. allow-...: abrir SOLO lo necesario, regla por regla.

  # 1) Bloquear todo (entrada y salida)
  kind: NetworkPolicy
  metadata: { name: default-deny-all }
  spec:
    podSelector: {}                 # aplica a TODOS los pods
    policyTypes: [Ingress, Egress]  # bloquea entrada Y salida
  ---
  # 2) Permitir solo: el ingress puede hablar con el api
  kind: NetworkPolicy
  metadata: { name: allow-ingress-to-api }
  spec:
    podSelector: { matchLabels: { app: api } }   # a quién protege
    policyTypes: [Ingress]
    ingress:
    - from:
      - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: ingress-nginx } }
      ports: [{ port: 3000 }]

Comandos:
  kubectl get networkpolicy -n micrositio
  kubectl describe networkpolicy allow-ingress-to-api -n micrositio
DEMO de bloqueo (lo que el profe quiere ver): un pod sin permiso intenta
conectarse a otro -> timeout / connection refused.
OJO: las NetworkPolicies solo funcionan si el CNI las soporta. Flannel NO,
Calico SÍ. Por eso tu proyecto usa Calico.

## Lo que debes poder decir
- Service = IP/nombre estable delante de pods; balancea; encuentra por etiqueta.
- ClusterIP (interno), NodePort (puerto en nodos), LoadBalancer (nube), Headless (DNS por pod).
- DNS interno: <servicio>.<namespace>.svc.cluster.local.
- Ingress = enrutamiento HTTP por dominio; TLS con cert-manager (ClusterIssuer+Certificate).
- NetworkPolicy = firewall entre pods: default-deny + allow. Requiere Calico (Flannel no).
