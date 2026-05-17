# Demos para la defensa (5 jun 2026)

> 8 demos · 20 min total · Orden y tiempos por Daniel Guerrero

## Setup inicial (1 sola vez tras levantar cluster)

```bash
bash demos/setup-sealed-secrets.sh   # Sealed Secrets controller + kubeseal
bash demos/setup-github-webhook.sh   # Webhook GitHub → ArgoCD sync instantáneo
bash demos/seed-data.sh              # Negocio + productos + usuario dueño
bash demos/pre-flight-check.sh       # Verifica 13 checks del cluster
```

## Demos principales (rúbrica)

| #   | Script                          | Min | Pts | Demuestra                                                                               |
| --- | ------------------------------- | --- | --- | --------------------------------------------------------------------------------------- |
| 1   | `demo-1-pedido-completo.sh`     | 4   | 5   | Cliente→Dueño→Worker→Webhook HMAC firmado (flujo completo)                              |
| 1'  | `demo-1-pedido-e2e.sh`          | 1   | —   | Versión corta (solo create + verify)                                                    |
| 2   | `demo-2-mongo-failover.sh`      | 2   | 15  | MongoDB RS + tolerancia 1 fallo                                                         |
| 3   | `demo-3-networkpolicy-block.sh` | 2   | 15  | NetworkPolicy default-deny + bloqueo rogue                                              |
| 4   | `demo-4-keda-scale.sh`          | 3   | 15  | KEDA scale-up 1→5 y scale-down                                                          |
| 5   | `demo-5-cicd-git-push.sh`       | 3   | 15  | Tekton (7 tasks: clone+trivy-fs+lint-test+kaniko+trivy-image) + ArgoCD sync via webhook |
| 6   | `demo-6-canary.sh`              | 2   | 10  | Argo Rollouts canary 10→50→100%                                                         |
| 7   | `demo-7-loki-search.sh`         | 2   | 10  | Búsqueda por `pedidoId` en Loki                                                         |
| 8   | `demo-8-qa.sh`                  | 2   | —   | Q&A cheatsheet (referencia, no ejecuta)                                                 |

## Demos extra (bonus + Q&A backup)

| Script                            | Bonus     | Para qué                                             |
| --------------------------------- | --------- | ---------------------------------------------------- |
| `demo-extra-resourcequota.sh`     | (5 base)  | Pod rechazado por exceso de quota                    |
| `demo-extra-analysis-template.sh` | **+3**    | Rollback automático por error rate (canary analysis) |
| `demo-extra-multicarrier.sh`      | **+5**    | Conmutación iVoy/Lalamove/Uber Direct según ciudad   |
| `demo-extra-webhook-hmac.sh`      | (defensa) | Webhook delivery con HMAC firmado + anti-replay      |
| `demo-extra-zuyu-webhook.sh`      | (defensa) | Webhook ZUYU sync inventario + idempotencia BullMQ   |

## Auditoría seguridad (pre-defensa)

```bash
bash demos/security-audit.sh
```

Corre npm audit + trivy fs + trivy image + busca secrets en plaintext. Te prepara para Q&A de Daniel sobre vulnerabilidades.

## Pre-flight check (1h antes de defensa)

```bash
bash demos/pre-flight-check.sh
```

Verifica 13 items:

- 3 nodos Ready · ArgoCD Synced/Healthy · 7 pods Running
- Mongo RS estable · KEDA Ready · HTTPS 200 (api + grafana)
- Imágenes en registry · 12+ NetworkPolicies · Rollout 2/2
- kubectl argo rollouts plugin

## Orden recomendado durante la defensa (20 min)

1. **Apertura** (30s): "Cluster K8s 1.28 en Rocky Linux 10 ARM64 — 1 master + 2 workers Parallels"
2. **`pre-flight-check.sh`** (30s) — todo verde
3. **`demo-1-pedido-completo`** (4 min) — flujo end-to-end real con HMAC
4. **`demo-2-mongo`** (2 min) — matar PRIMARY, sigue funcionando
5. **`demo-3-netpol`** (2 min) — rogue pod bloqueado
6. **`demo-4-keda`** (3 min) — escala 1→5
7. **`demo-5-cicd`** (3 min) — git push → cluster (con webhook GitHub instantáneo)
8. **`demo-6-canary`** (2 min) — Rollout gradual
9. **`demo-7-loki`** (2 min) — búsqueda pedidoId
10. **Q&A** (2 min)

Si sobra tiempo (o si Daniel pregunta):

- `demo-extra-multicarrier.sh` — conmutación por ciudad
- `demo-extra-analysis-template.sh` — rollback automático
- `demo-extra-resourcequota.sh` — pod rechazado por exceder cuota
- `demo-extra-webhook-hmac.sh` — anti-replay con HMAC
- `demo-extra-zuyu-webhook.sh` — integración ZUYU bidireccional

Cada demo es **idempotente** — se puede correr múltiples veces sin daños.
