# 🛠️ Runbook: conectar el clúster al NFS del profe

> Guía paso a paso para apuntar el almacenamiento del clúster a un **NFS externo**
> (el del profesor), en lugar del NFS local que vive en el master.
>
> **Por qué:** desacopla el almacenamiento del control-plane. Si el master se cae,
> los datos siguen vivos en el servidor externo. Es el patrón de producción.
>
> 💡 **Atajo:** en vez de seguir esto a mano, corre el asistente interactivo:
> `scripts/conectar-nfs-profe.sh` (te va preguntando todo).

---

## 📌 Datos que le pides al profe primero

1. **IP de su NFS** → `IP_PROFE`
2. **Carpeta que comparte** → `RUTA_PROFE` (ej. `/srv/nfs/alumnos`)
3. Que **autorice tu subred** en su NFS (`10.211.55.0/24` y `10.244.0.0/16`) **con escritura**
   y permita el UID de tus pods (MongoDB = 999, api = 1000) o use `no_root_squash`.

---

## PASO 1 — Probar que tus nodos ALCANZAN el NFS del profe

> Hazlo en **los 3 nodos** (master, worker-01, worker-02). Si un worker no alcanza,
> los pods que caigan ahí fallarán.

```bash
ping -c2 IP_PROFE                 # ¿responde la máquina?
showmount -e IP_PROFE             # ¿lista su carpeta compartida?
nc -zv IP_PROFE 2049              # ¿el puerto de NFS está abierto?
```

✅ **Debes ver:** ping OK + la carpeta `RUTA_PROFE` en la lista + "succeeded" en el 2049.

Si falta `showmount`/`nc`: `sudo dnf install -y nfs-utils nmap-ncat`

---

## PASO 2 — Probar montaje y ESCRITURA a mano (en un worker)

> Descarta el problema de permisos **antes** de meter Kubernetes.

```bash
sudo mkdir -p /mnt/prueba-profe
sudo mount -t nfs IP_PROFE:RUTA_PROFE /mnt/prueba-profe
echo "hola profe" | sudo tee /mnt/prueba-profe/test.txt    # ¿puedo escribir?
cat /mnt/prueba-profe/test.txt
sudo umount /mnt/prueba-profe
```

✅ **Debes ver:** se escribe y se lee "hola profe".
❌ **"permission denied":** el profe debe ajustar permisos (UID o `no_root_squash`).

---

## PASO 3 — Crear la StorageClass nueva (sin borrar la tuya)

`nfs-profe-sc.yaml`:

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: nfs-profe
provisioner: nfs.csi.k8s.io
parameters:
  server: IP_PROFE        # ← la IP del profe
  share: RUTA_PROFE       # ← su carpeta
reclaimPolicy: Retain
volumeBindingMode: Immediate
allowVolumeExpansion: true
```

```bash
kubectl apply -f nfs-profe-sc.yaml
kubectl get sc                    # debes ver 'nfs-profe'
```

---

## PASO 4 — Probar con un disco de juguete (PVC + pod)

`test-profe.yaml`:

```yaml
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
```

```bash
kubectl apply -f test-profe.yaml
kubectl get pvc -n micrositio test-profe-pvc        # ✅ debe decir 'Bound'
kubectl exec -n micrositio test-profe-pod -- cat /data/ok.txt   # ✅ 'funciona'
# limpieza:
kubectl delete pod test-profe-pod -n micrositio
kubectl delete pvc test-profe-pvc -n micrositio
```

---

## PASO 5 — Usarlo de verdad (elige una)

**Opción A (recomendada para demo) — hacerla la default y empezar fresco:**

```bash
kubectl patch storageclass nfs-csi   -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
kubectl patch storageclass nfs-profe -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

**Opción B — mover MongoDB explícitamente:**
> ⚠️ El `volumeClaimTemplate` de un StatefulSet **NO se puede cambiar en caliente**
> (es inmutable). Para mover MongoDB hay que **borrar y recrear** el StatefulSet con
> `storageClassName: nfs-profe` → empieza de cero o migra datos a mano.

---

## PASO 6 — Plan de reversa (si algo sale mal)

```bash
kubectl patch storageclass nfs-profe -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
kubectl patch storageclass nfs-csi   -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

Tus datos viejos siguen intactos en el master (`Retain`). **Nada se pierde.**

---

## ⚠️ Los 2 errores que más se atoran

| Síntoma | Causa | Fix |
|---|---|---|
| PVC en `Pending` | tus nodos no alcanzan el NFS, o no exportó tu subred | revisa PASO 1; pide al profe que exporte tu red |
| pod en `CrashLoop` / "permission denied" | UID de tu pod no puede escribir | el profe ajusta permisos (UID 999/1000 o `no_root_squash`) |
