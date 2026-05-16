# ADR-007: Registry de imágenes local in-cluster (no Docker Hub / GHCR / ECR)

**Fecha:** 2026-05-16
**Estado:** Aceptado
**Decisores:** Sebastián Contreras

## Contexto

El pipeline CI/CD (Tekton) buildea las imágenes `micrositio-api` y `micrositio-worker` con Kaniko
y necesita pushearlas a un registry que kubelet pueda consumir.

Opciones evaluadas:

| Opción                                       | Pro                                                    | Contra                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Docker Hub free**                          | Conocido, simple setup                                 | Rate limit 100 pulls / 6h por IP — un cluster con 3 nodos detrás del mismo NAT lo agota rápido. Pide credenciales para push. |
| **GitHub Container Registry (ghcr.io)**      | Gratis ilimitado para repos públicos                   | Requiere token GitHub `packages:write` (otro secret que rotar). Solo soporta clásico PAT, no fine-grained todavía.           |
| **Quay.io / Amazon ECR Public**              | Sin rate limits documentados                           | Otro proveedor, otro account, otro secret                                                                                    |
| **Registry local in-cluster (`registry:2`)** | Cero credenciales, cero rate limits, ofuscado a la LAN | Insecure HTTP requiere config containerd, no accesible fuera del cluster                                                     |

## Decisión

**Registry local `registry:2` en namespace `registry`, expuesto vía NodePort 30500.**

Configuración:

- Deployment 1 réplica de `registry:2`
- PVC `nfs-csi` 10Gi para almacenar imágenes
- Service NodePort 30500 (sin TLS, HTTP plain)
- Containerd en cada nodo configurado con `/etc/containerd/certs.d/<MASTER-IP>:30500/hosts.toml`
  marcando el registry como insecure

## Trade-offs aceptados

- **No accesible desde fuera del cluster** — para el demo está bien. Si alguien quiere
  reproducir la app fuera, debe re-buildear localmente
- **HTTP sin TLS** — vive en LAN privada del cluster, no expuesto
- **Sin auth** — el cluster ya es privado y el registry no escucha en interfaz pública
- **Si cambias el IP del master** se rompe (las imágenes referencian `10.211.55.30:30500/...`)

## Para producción

- Migrar a Harbor (registry con UI, auth, scanning Trivy integrado, replication)
- O usar registry cloud-managed (GAR, ECR private) con OIDC/IAM

## Resultado

- Cero secrets en chat o repo (vs. opciones con tokens)
- Cero rate limits (vs. Docker Hub)
- Builds Tekton + pulls kubelet funcionan sin tocar internet (offline-capable)
