# Demos para la defensa (5 jun 2026)

> 8 demos · 20 min total · Orden y tiempos por Daniel Guerrero

## Pre-defensa setup (1 sola vez)

```bash
bash demos/seed-data.sh           # negocio + productos + usuario dueño en BD
bash demos/pre-flight-check.sh    # verifica 13 checks del cluster
```

## Demos principales (rúbrica)

| #   | Script                          | Min | Pts | Demuestra                                     |
| --- | ------------------------------- | --- | --- | --------------------------------------------- |
| 1   | `demo-1-pedido-completo.sh`     | 4   | 5   | Cliente→Dueño→Worker→Webhook (flujo completo) |
| 1'  | `demo-1-pedido-e2e.sh`          | 1   | —   | Versión corta (solo create + verify)          |
| 2   | `demo-2-mongo-failover.sh`      | 2   | 15  | MongoDB RS + tolerancia 1 fallo               |
| 3   | `demo-3-networkpolicy-block.sh` | 2   | 15  | NetworkPolicy default-deny + bloqueo rogue    |
| 4   | `demo-4-keda-scale.sh`          | 3   | 15  | KEDA scale-up 1→5 y scale-down                |
| 5   | `demo-5-cicd-git-push.sh`       | 3   | 15  | Tekton (kaniko build) + ArgoCD sync auto      |
| 6   | `demo-6-canary.sh`              | 2   | 10  | Argo Rollouts canary 10→50→100%               |
| 7   | `demo-7-loki-search.sh`         | 2   | 10  | Búsqueda por `pedidoId` en Loki               |
| 8   | `demo-8-qa.sh`                  | 2   | —   | Q&A cheatsheet (no ejecuta, referencia)       |

## Demos extra (bonus + cosas que Daniel puede pedir)

| Script                            | Bonus    | Para qué                                             |
| --------------------------------- | -------- | ---------------------------------------------------- |
| `demo-extra-resourcequota.sh`     | (5 base) | Pod rechazado por exceso de quota                    |
| `demo-extra-analysis-template.sh` | **+3**   | Rollback automático por error rate (canary analysis) |
| `demo-extra-multicarrier.sh`      | **+5**   | Conmutación iVoy/Lalamove/Uber Direct según ciudad   |

## Pre-defensa checklist (1h antes)

```bash
bash demos/pre-flight-check.sh
```

Verifica:

- 3 nodos Ready
- ArgoCD Synced/Healthy
- HTTPS responde 200 (api + grafana)
- Mongo RS estable (1 PRIMARY + 2 SECONDARY)
- Imágenes en registry (api + worker)
- KEDA ScaledObject Ready
- 12 NetworkPolicies aplicadas
- Rollout api 2/2
- Argo Rollouts CLI plugin instalado

## Cómo correr una demo

```bash
# Desde el master via SSH O desde tu Mac con kubeconfig copiado
bash demos/demo-1-pedido-completo.sh
```

Cada demo es **idempotente** — se puede correr múltiples veces sin daños.

## Orden recomendado durante la defensa (20 min)

1. **Apertura** (30s): "Cluster K8s 1.28 en Rocky Linux 10 ARM64 — 1 master + 2 workers en Parallels"
2. **`pre-flight-check.sh`** (30s) — muestra todo en verde
3. **demo-1-completo** (4 min) — flujo end-to-end real
4. **demo-2-mongo** (2 min) — matar PRIMARY, sigue funcionando
5. **demo-3-netpol** (2 min) — rogue pod bloqueado
6. **demo-4-keda** (3 min) — escala 1→5
7. **demo-5-cicd** (3 min) — git push → cluster
8. **demo-6-canary** (2 min) — Rollout gradual
9. **demo-7-loki** (2 min) — búsqueda pedidoId
10. **demos extra** si queda tiempo (multi-carrier, analysis-template)
11. **Q&A** (2 min) — referenciar `demo-8-qa.sh` para tus respuestas
