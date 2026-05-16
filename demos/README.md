# Demos para la defensa (5 jun 2026)

> 8 demos · 20 min total · Orden y tiempos por Daniel Guerrero

| #   | Script                          | Min | Pts | Demuestra                                       |
| --- | ------------------------------- | --- | --- | ----------------------------------------------- |
| 1   | `demo-1-pedido-e2e.sh`          | 4   | 5   | App funcional end-to-end                        |
| 2   | `demo-2-mongo-failover.sh`      | 2   | 15  | MongoDB Replica Set + tolerancia a fallo        |
| 3   | `demo-3-networkpolicy-block.sh` | 2   | 15  | NetworkPolicy default-deny bloqueando pod rogue |
| 4   | `demo-4-keda-scale.sh`          | 3   | 15  | KEDA scale-up 1→5 y scale-down 5→1              |
| 5   | `demo-5-cicd-git-push.sh`       | 3   | 15  | Tekton (build+kaniko) + ArgoCD sync automático  |
| 6   | `demo-6-canary.sh`              | 2   | 10  | Argo Rollouts canary 10% → 50% → 100%           |
| 7   | `demo-7-loki-search.sh`         | 2   | 10  | Búsqueda de pedido por `pedidoId` en Loki       |
| 8   | `demo-8-qa.sh`                  | 2   | —   | Q&A (cheatsheet de preguntas anticipadas)       |

**Demos implícitas** (Daniel puede pedirlas spontáneamente):

- `demo-extra-tls.sh` — candado verde HTTPS con CA importada
- `demo-extra-resourcequota.sh` — pod rechazado por exceso
- `demo-extra-analysis-template.sh` — rollback automático por error rate (bonus +3)

## Pre-defensa checklist (1h antes)

```bash
bash demos/pre-flight-check.sh
```

Verifica:

- 3 nodos Ready
- ArgoCD Synced/Healthy
- HTTPS responde 200
- Mongo RS estable (1 PRIMARY + 2 SECONDARY)
- Imágenes en registry
- KEDA Ready

## Cómo correr una demo

```bash
# Desde el master via SSH O desde tu Mac con kubeconfig copiado
bash demos/demo-1-pedido-e2e.sh
```

Cada demo es idempotente — se puede correr múltiples veces sin daños.
