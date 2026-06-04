# 🎓 Roadmap de Estudio para la Defensa — Proyecto Final K8s (ZUYU)

> Objetivo: dominar TODO lo del semestre + lo que agregaste al proyecto, para
> exponer al profe Daniel Guerrero sin trabarte. Se estudia de arriba a abajo.

---

## Cómo usar este roadmap
- Cada módulo se enseña por separado ("poco a poco"). Pide "siguiente" para avanzar.
- Los módulos 1–8 son **lo que se vio en clase** (fundamentos).
- El módulo 9 es **lo que TÚ agregaste** (más allá de la clase) — lo que más te preguntará.
- El módulo 10 es el **simulacro de defensa**: qué se implementó + cómo te pone a prueba el profe.

---

## 🗺️ Los 10 módulos

### FASE A — Fundamentos (el "por qué")
- [ ] **Módulo 1 — Contenedores y Kubernetes: qué son y por qué**
  - VM vs contenedor, imagen vs contenedor, qué resuelve K8s
  - Arquitectura: control plane (master) vs workers, kubelet, API server, etcd, scheduler
  - kubectl: cómo hablas con el cluster

### FASE B — Linux base (inicio del semestre)
- [ ] **Módulo 2 — Linux para administrar el cluster**
  - Usuarios, grupos, permisos (chmod octal, setgid, sticky)
  - LVM (pvcreate → vgextend → lvextend → xfs_growfs)
  - Hardening: SELinux, SSH seguro, sudo/sudoers

### FASE C — Contenedores
- [ ] **Módulo 3 — Podman / Contenedores**
  - Imágenes, Containerfile/Dockerfile, build, run
  - Volúmenes, redes, pods, registry

### FASE D — Kubernetes núcleo
- [ ] **Módulo 4 — Objetos básicos de K8s**
  - Namespace, Pod, multi-contenedor, init-container
  - ConfigMap (env + volumen), Secret + base64
  - ServiceAccount + RBAC (Role/RoleBinding, `auth can-i`)

- [ ] **Módulo 5 — Workloads**
  - Deployment, ReplicaSet, RollingUpdate
  - DaemonSet (1 por nodo)
  - StatefulSet (identidad estable, volumeClaimTemplates)

### FASE E — Redes y almacenamiento
- [ ] **Módulo 6 — Networking**
  - Services: ClusterIP, NodePort, LoadBalancer, headless
  - DNS interno, Ingress + TLS (cert-manager)
  - NetworkPolicy (default-deny + allow)

- [ ] **Módulo 7 — Storage**
  - emptyDir, hostPath
  - PV, PVC, StorageClass, NFS CSI Driver
  - reclaimPolicy, accessModes

### FASE F — Infra y observabilidad
- [ ] **Módulo 8 — Instalación (Ansible) + Observabilidad**
  - kubeadm, CNI (Flannel vs Calico), firewalld, VXLAN
  - Ansible: inventario + playbook
  - Prometheus, Grafana, node-exporter, kube-state-metrics, PromQL

### FASE G — Lo TUYO (más allá de la clase)
- [ ] **Módulo 9 — Componentes avanzados de tu proyecto**
  - CI/CD: Tekton (Pipeline, Task, Trigger/EventListener) + ArgoCD (GitOps)
  - Canary: Argo Rollouts + AnalysisTemplate
  - Escalado: KEDA (ScaledObject por cola Redis)
  - Gobernanza: ResourceQuota + LimitRange
  - Seguridad: SealedSecrets, HMAC webhooks
  - La app: Node/Express + EJS + MongoDB ReplicaSet + Redis + BullMQ + worker

### FASE H — Defensa
- [ ] **Módulo 10 — Simulacro: qué implementaste + cómo te prueba el profe**
  - Mapa: cada tema del semestre → dónde aparece en tu proyecto
  - Banco de preguntas del profe + respuestas
  - Los 7 demos en vivo paso a paso

### FASE I — Repaso práctico
- [ ] **Módulo 11 — Laboratorio de ejercicios (repaso de TODOS los comandos)**
  - Ejercicios prácticos que combinan todo lo visto (Linux + K8s + tu proyecto)
  - Tipo "reto": te doy una tarea, tú escribes el comando; luego la solución
  - Quiz de terminal: completar el comando correcto
  - Objetivo: tener los dedos entrenados para la demo en vivo
  - NOTA: cada módulo deja sus comandos en un "banco" acumulado para este lab final

---

## Reglas de oro para la defensa
1. **Nunca digas "no sé"** — di "lo implementé en X, déjame mostrarte" y abre el archivo.
2. **Cada componente tiene un PORQUÉ de negocio** — no es "porque sí", es "para resolver Y".
3. **Si difiere de la clase, es porque mejoraste** — ten lista la justificación (ej. Calico vs Flannel).
4. **Demuestra en vivo, no con capturas** — la rúbrica lo exige.
