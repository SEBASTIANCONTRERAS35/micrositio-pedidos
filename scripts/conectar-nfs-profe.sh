#!/usr/bin/env bash
# ============================================================================
# Asistente INTERACTIVO para conectar el clúster al NFS del profe.
#
# No tienes que memorizar comandos: el script te va PREGUNTANDO en la terminal
# y hace cada paso por ti, con confirmación y mensajes claros.
#
# Ejecutar EN EL MASTER (donde vive kubectl):
#     bash conectar-nfs-profe.sh
# ============================================================================

# --- colores y ayudantes -----------------------------------------------------
G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; B='\033[1;34m'; N='\033[0m'
ok()    { echo -e "  ${G}✅ $*${N}"; }
err()   { echo -e "  ${R}❌ $*${N}"; }
warn()  { echo -e "  ${Y}⚠️  $*${N}"; }
info()  { echo -e "  ${B}ℹ️  $*${N}"; }
title() { echo; echo -e "${B}════ $* ════${N}"; }
ask()   { local r; read -rp "  ❓ $* [s/N]: " r; [[ "$r" =~ ^[sSyY] ]]; }

echo -e "${B}"
echo "╔════════════════════════════════════════════════════╗"
echo "║   Asistente: conectar el clúster al NFS del profe   ║"
echo "╚════════════════════════════════════════════════════╝"
echo -e "${N}"
info "Este asistente NO borra nada sin preguntarte. Puedes salir con Ctrl+C."

# --- PASO 0: comprobaciones --------------------------------------------------
title "PASO 0 — Comprobaciones"
if ! command -v kubectl >/dev/null 2>&1; then
  err "no encuentro 'kubectl'. ¿Estás en el master? Aquí debe correr."
  exit 1
fi
if ! kubectl get nodes >/dev/null 2>&1; then
  err "kubectl no puede hablar con el clúster (revisa tu kubeconfig)."
  exit 1
fi
ok "kubectl funciona y el clúster responde"

# --- PASO 1: pedir datos del profe -------------------------------------------
title "PASO 1 — Datos del NFS del profe"
read -rp "  👉 IP del NFS del profe (ej. 10.211.55.50): " NFS_IP
read -rp "  👉 Carpeta que comparte (ej. /srv/nfs/alumnos): " NFS_PATH
if [[ -z "$NFS_IP" || -z "$NFS_PATH" ]]; then
  err "faltan datos. Vuelve a correr el asistente cuando los tengas."
  exit 1
fi
info "Voy a usar:  ${NFS_IP}:${NFS_PATH}"

# --- PASO 2: conectividad desde ESTE nodo ------------------------------------
title "PASO 2 — Probar conexión desde ESTE nodo ($(hostname))"
if ping -c2 -W2 "$NFS_IP" >/dev/null 2>&1; then ok "ping OK"; else err "no responde al ping (¿IP correcta? ¿hay red?)"; fi

if command -v showmount >/dev/null 2>&1; then
  if showmount -e "$NFS_IP" 2>/dev/null | grep -q "$NFS_PATH"; then
    ok "el NFS exporta $NFS_PATH"
  else
    warn "showmount NO lista $NFS_PATH (puede que no exportó tu red, o que oculta la lista)"
  fi
else
  warn "no tengo 'showmount' — instálalo con: sudo dnf install -y nfs-utils"
fi

if command -v nc >/dev/null 2>&1; then
  if nc -z -w3 "$NFS_IP" 2049 2>/dev/null; then ok "puerto 2049 (NFS) abierto"; else err "puerto 2049 cerrado/inalcanzable"; fi
else
  warn "no tengo 'nc' — instálalo con: sudo dnf install -y nmap-ncat"
fi

# --- PASO 3: montaje manual de prueba (escritura real) -----------------------
title "PASO 3 — Probar ESCRITURA real (montaje manual)"
if ask "¿Montar y escribir un archivo de prueba? (requiere sudo)"; then
  TMPM=/mnt/prueba-nfs-profe
  sudo mkdir -p "$TMPM"
  if sudo mount -t nfs "${NFS_IP}:${NFS_PATH}" "$TMPM" 2>/dev/null; then
    ok "montado en $TMPM"
    if echo "prueba ZUYU $(date)" | sudo tee "$TMPM/zuyu-test.txt" >/dev/null 2>&1; then
      ok "ESCRITURA OK (el profe permite escribir 👍)"
      sudo rm -f "$TMPM/zuyu-test.txt" 2>/dev/null
    else
      err "NO puedo escribir → el profe debe ajustar permisos (UID o no_root_squash)"
    fi
    sudo umount "$TMPM" 2>/dev/null && ok "desmontado"
  else
    err "no se pudo montar → revisa exports del profe y la red (PASO 2)"
  fi
fi

# --- PASO 4: probar desde los workers (opcional, vía SSH) --------------------
title "PASO 4 — Probar desde los WORKERS (opcional)"
warn "Importante: los pods corren en los workers, así que ELLOS deben alcanzar el NFS."
if ask "¿Probar la conexión desde los workers por SSH?"; then
  read -rp "  usuario SSH de los workers [sebastian]: " SU; SU=${SU:-sebastian}
  read -rp "  IPs de los workers separadas por espacio [10.211.55.39 10.211.55.38]: " WIPS
  WIPS=${WIPS:-"10.211.55.39 10.211.55.38"}
  for w in $WIPS; do
    echo "  -- worker $w --"
    if RES=$(ssh -o BatchMode=yes -o ConnectTimeout=6 "${SU}@${w}" "nc -z -w3 ${NFS_IP} 2049 && echo ALCANZA || echo FALLA" 2>/dev/null); then
      [[ "$RES" == *ALCANZA* ]] && ok "     $w SÍ alcanza el NFS" || err "     $w NO alcanza el NFS"
    else
      warn "     no pude entrar por SSH a $w (pruébalo a mano: nc -zv ${NFS_IP} 2049)"
    fi
  done
fi

# --- PASO 5: crear la StorageClass -------------------------------------------
title "PASO 5 — Crear la StorageClass 'nfs-profe'"
if kubectl get sc nfs-profe >/dev/null 2>&1; then
  warn "'nfs-profe' ya existe. La dejo como está (bórrala a mano si quieres recrearla)."
elif ask "¿Crear la StorageClass nfs-profe -> ${NFS_IP}:${NFS_PATH}?"; then
  cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: nfs-profe
provisioner: nfs.csi.k8s.io
parameters:
  server: ${NFS_IP}
  share: ${NFS_PATH}
reclaimPolicy: Retain
volumeBindingMode: Immediate
allowVolumeExpansion: true
EOF
  ok "StorageClass 'nfs-profe' creada"
fi

# --- PASO 6: probar con PVC + pod de juguete ---------------------------------
title "PASO 6 — Validar en Kubernetes (PVC + pod de prueba)"
if ask "¿Crear un PVC y un pod de prueba para validar de extremo a extremo?"; then
  cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: test-profe-pvc, namespace: micrositio }
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: nfs-profe
  resources: { requests: { storage: 1Gi } }
---
apiVersion: v1
kind: Pod
metadata: { name: test-profe-pod, namespace: micrositio }
spec:
  securityContext: { runAsNonRoot: true, runAsUser: 1000, fsGroup: 1000, seccompProfile: { type: RuntimeDefault } }
  containers:
    - name: test
      image: busybox:1.36
      command: ["sh","-c","echo funciona > /data/ok.txt && sleep 3600"]
      securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: [ALL] } }
      volumeMounts: [{ name: vol, mountPath: /data }]
  volumes:
    - name: vol
      persistentVolumeClaim: { claimName: test-profe-pvc }
EOF
  info "esperando a que el PVC quede 'Bound' (hasta 30s)..."
  ST=""
  for _ in $(seq 1 15); do
    ST=$(kubectl get pvc test-profe-pvc -n micrositio -o jsonpath='{.status.phase}' 2>/dev/null)
    [[ "$ST" == "Bound" ]] && break; sleep 2
  done
  [[ "$ST" == "Bound" ]] && ok "PVC Bound (el disco se creó en el NFS del profe)" || err "el PVC no llegó a 'Bound' → revisa PASO 2/exports"

  info "esperando que el pod arranque (hasta 40s)..."
  kubectl wait --for=condition=Ready pod/test-profe-pod -n micrositio --timeout=40s >/dev/null 2>&1
  if kubectl exec test-profe-pod -n micrositio -- cat /data/ok.txt 2>/dev/null | grep -q funciona; then
    ok "el pod ESCRIBIÓ y LEYÓ en el NFS del profe 🎉  (todo funciona)"
  else
    err "el pod no pudo escribir/leer → casi seguro permisos (UID). Revisa con el profe."
  fi

  if ask "¿Borrar el PVC y pod de prueba?"; then
    kubectl delete pod test-profe-pod -n micrositio >/dev/null 2>&1
    kubectl delete pvc test-profe-pvc -n micrositio >/dev/null 2>&1
    ok "prueba limpiada"
  fi
fi

# --- PASO 7: hacerla default (opcional) --------------------------------------
title "PASO 7 — ¿Usar el NFS del profe POR DEFECTO?"
warn "Esto hará que TODO disco NUEVO se cree en el NFS del profe."
warn "MongoDB ya tiene sus discos en el NFS viejo: para moverlo hay que RECREAR"
warn "el StatefulSet (empieza de cero o migra datos). No se mueve solo."
if ask "¿Hacer 'nfs-profe' la StorageClass por defecto?"; then
  kubectl patch storageclass nfs-csi   -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}' >/dev/null 2>&1
  kubectl patch storageclass nfs-profe -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'  >/dev/null 2>&1
  ok "ahora 'nfs-profe' es la default"
fi

# --- final -------------------------------------------------------------------
title "LISTO ✅"
echo
info "Estado actual de tus StorageClasses:"
kubectl get sc 2>/dev/null | sed 's/^/    /'
echo
info "Para REVERTIR la default a tu NFS local (plan de reversa):"
echo "    kubectl patch storageclass nfs-profe -p '{\"metadata\":{\"annotations\":{\"storageclass.kubernetes.io/is-default-class\":\"false\"}}}'"
echo "    kubectl patch storageclass nfs-csi   -p '{\"metadata\":{\"annotations\":{\"storageclass.kubernetes.io/is-default-class\":\"true\"}}}'"
echo
ok "Fin del asistente. Tus datos viejos siguen seguros en el master (Retain)."
