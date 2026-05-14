# Fase 8 — Hardening + Defensa · Checklist

> Pulir todo, ensayar las 8 demos, hacer el repo público.
> Días 22–24 (mar 3 jun – jue 5 jun).

## Lo que YO ya hice

- [x] 5 ADRs en `docs/adr/`
- [x] 7 scripts de demo en `scripts/`
- [x] README con instrucciones reproducibles
- [x] SECURITY.md y CONTRIBUTING.md
- [x] Verificación grep: 0 referencias a ZUYU/PillDB en el código

## Lo que TÚ tienes que hacer

### 1. Auditoría de seguridad final
```bash
# Trivy scan de las imágenes finales
trivy image SEBASTIANCONTRERAS35/micrositio-api:latest --severity HIGH,CRITICAL
trivy image SEBASTIANCONTRERAS35/micrositio-worker:latest --severity HIGH,CRITICAL

# npm audit
cd api && npm audit --audit-level=high
cd ../worker && npm audit --audit-level=high

# Verificar que no hay secrets en plaintext en el repo
grep -r "password\|secret\|token\|key" --include="*.yaml" k8s/ | grep -v "example\|sealedsecret\|name:" || echo "OK"

# Verificar todos los pods con securityContext correcto
kubectl get pods -n micrositio -o yaml | grep -A 5 securityContext
```

### 2. Verificar que la rúbrica completa está cubierta
Revisar `RUBRICA-VERIFICACION.md` (ver archivo siguiente)

### 3. Documentación final
```bash
# Verificar que README es ejecutable por una persona externa
# (pedir a un compañero que lo siga sin tu ayuda)
```

### 4. Ensayar las 8 demos cronometradas (3 veces mínimo)

#### Ensayo 1 (sin trampa, identificar problemas)
- Demo 1: Flujo completo (4 min) → ¿se atora algo?
- Demo 2: MongoDB failover (2 min) → ¿el cluster se recupera rápido?
- Demo 3: NetworkPolicy (2 min) → ¿el rogue pod realmente timeout?
- Demo 4: KEDA scale (3 min) → ¿escala antes de 30s?
- Demo 5: CI/CD (3 min) → ¿el pipeline corre sin errores?
- Demo 6: Canary (2 min) → ¿se ve la promoción gradual?
- Demo 7: Loki search (2 min) → ¿el pedidoId regresa logs correlacionados?
- Q&A (2 min)

**TOTAL: <20 min**

#### Ensayo 2 y 3
- Cronómetro estricto
- Si una demo se pasa, ajustar script
- Si algo no funciona, arreglar antes del día 5

### 5. **CRÍTICO**: Cambiar el repo de PRIVADO a PÚBLICO (4 jun)
1. GitHub → Settings → General → Danger Zone → Change visibility → Make public
2. Confirmar que el repo es navegable sin login
3. Verificar que no hay secrets visibles (debería ser solo Sealed Secrets cifrados)

### 6. Backup del cluster antes de la defensa
```bash
# Snapshot de etcd
sudo ETCDCTL_API=3 etcdctl --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  snapshot save /backup/etcd-pre-defensa.db

# Backup de los manifestos aplicados
kubectl get all,sealedsecret,networkpolicy,scaledobject,rollout -n micrositio -o yaml > /backup/manifestos-snapshot.yaml
```

### 7. Configurar el laptop de defensa
```bash
# 1. Instalar CA raíz en Chrome del laptop
kubectl get secret root-ca -n cert-manager -o jsonpath='{.data.ca\.crt}' | base64 -d > ~/Desktop/ca.crt
# Importar manualmente en Chrome → Settings → Privacy → Manage Certificates → Authorities → Import

# 2. /etc/hosts
echo "<INGRESS-IP> zuyu.local" | sudo tee -a /etc/hosts

# 3. Verificar acceso al cluster
kubectl get nodes
kubectl get pods -n micrositio

# 4. Probar todos los demos en orden 1 hora antes de la defensa
```

### 8. Día de la defensa (5 jun)
- Llegar 1 hora antes
- Hacer 1 ensayo rápido sin público
- Tener copia del README en pantalla por si Daniel quiere verlo

## Checkpoint final
✅ Trivy scan: 0 críticos
✅ npm audit clean
✅ Todas las 8 demos ensayadas 3+ veces en <18 min total
✅ Repo PÚBLICO en GitHub
✅ CA importado en browser de defensa
✅ Backup del cluster y manifestos hecho
✅ README ejecutable por persona externa

---

## Si algo sale mal en la defensa

### El cluster no responde
- Backup de etcd: restaurar desde `/backup/etcd-pre-defensa.db`
- Si tampoco eso: tienes los manifestos y puedes redesplegar (toma 20 min)

### El navegador no muestra candado verde
- Verificar que el CA está en el browser
- Si Chrome insiste: usar Firefox de respaldo

### Una demo falla en vivo
- NO entrar en pánico
- Pasar a la siguiente y volver al final
- En Q&A: explicar qué pasó técnicamente — Daniel valora más el entendimiento que el éxito al primer intento
