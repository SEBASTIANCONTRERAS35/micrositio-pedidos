#!/usr/bin/env bash
# DEMO 8 — Q&A cheatsheet (2 min · respuestas anticipadas a preguntas de Daniel)
# NO se ejecuta, es referencia para ti durante la defensa.
cat <<'EOF'
═══════════════════════════════════════════════════════════════════
 DEMO 8 — Q&A — Preguntas anticipadas y respuestas
═══════════════════════════════════════════════════════════════════

P: ¿Por qué Calico y no Flannel?
R: Flannel no implementa NetworkPolicy. Calico sí (vía Felix + eBPF/iptables).
   La rúbrica exige demo de NetworkPolicy bloqueando — Flannel ignoraría las
   policies y un pod rogue pasaría. Vimos esto explícitamente en la propuesta
   aceptada por Daniel.

P: ¿Por qué Replica Set de 3 nodos y no 1?
R: MongoDB requiere RS para transacciones multi-documento (lo usamos al crear
   pedido — descontar stock + insertar pedido en una sola transacción atómica
   con session.withTransaction). 3 nodos es el mínimo para quorum: tolera 1
   fallo y sigue eligiendo PRIMARY.

P: ¿Cómo escala KEDA por cola Redis si HPA nativo no soporta Redis?
R: KEDA es un "metrics adapter" — expone una métrica external (longitud de
   lista Redis) que HPA consume como si fuera CPU. ScaledObject define el
   trigger (type: redis, listName: bull:notificaciones:wait, threshold: 5).
   KEDA crea internamente el HPA con esa métrica.

P: ¿Qué pasa si el cluster pierde conectividad con el carrier (Uber/Lalamove)?
R: El worker usa BullMQ con retry exponencial (3 intentos, backoff 5s/15s/45s).
   El pedido queda en estado 'pendiente_repartidor'. El dueño puede reintentar
   manualmente desde el panel. Webhook que llegue eventualmente actualiza estado.

P: ¿Cómo se asegura idempotencia en los webhooks de delivery?
R: Por delivery_id + estado en Redis con TTL 24h (clave: webhook:<delivery_id>:<estado>).
   Si llega 2 veces el mismo webhook, el segundo es no-op. Plus firma HMAC
   verifica que viene del carrier real (no spoofeo).

P: ¿Por qué NFS para MongoDB si oficialmente no se recomienda?
R: Deuda técnica aceptable para proyecto académico. Ver docs/adr/006. En prod
   migraría a block storage local (Longhorn/OpenEBS) o cloud disk + operator
   Bitnami/Percona.

P: ¿Por qué registry local y no Docker Hub?
R: ADR-007. Cero credenciales en CI, cero rate limits Docker Hub. En prod
   sería Harbor (con auth + Trivy scanning).

P: ¿Cómo gestionas secrets (no veo en el repo)?
R: Solo .example.yaml en el repo. En el cluster los creo manualmente con
   openssl rand. En prod sería Sealed Secrets (Bitnami) o External Secrets
   Operator + Vault/AWS Secrets Manager. Ver ADR-004.

P: ¿Qué pasa si Pod Security Standards restricted bloquea mongo?
R: ADR-008. Bajamos a 'baseline' en enforce (mantenemos 'restricted' en audit/warn)
   porque mongo init container necesita CHOWN para el keyfile. Compensamos con
   NetworkPolicy default-deny + runAsNonRoot en los pods de app (api, worker).

P: ¿Cómo demo el AnalysisTemplate bonus (+3)?
R: kubectl argo rollouts set image api api=imagen-broken:v999 -n micrositio
   El analysis-template apunta a query Prometheus (rate de 5xx > 5%).
   El Rollout aborta automáticamente. Ver demo-extra-analysis-template.sh.

P: ¿Por qué Tekton y no GitHub Actions / GitLab CI?
R: El cluster es bare-metal sin runners externos preinstalados. Tekton corre
   nativo en K8s (CRDs Pipeline/Task/PipelineRun), no requiere infra adicional.
   Plus integración directa con kubectl/oc para deploy posterior.

P: ¿Cuánto te costaría poner esto en producción real?
R: Estimación mensual:
   - Infra K8s managed (GKE/EKS): ~$150 (3 nodos n1-standard-2 + control plane)
   - Block storage MongoDB: ~$30 (3x 20GB SSD)
   - LoadBalancer + IP estática: ~$20
   - Registry Harbor: ~$10 (1 nodo extra)
   - Total: ~$210/mes
   Vs. comprar VPS bare metal en Hetzner: ~$60/mes los 3 nodos.

═══════════════════════════════════════════════════════════════════
EOF
