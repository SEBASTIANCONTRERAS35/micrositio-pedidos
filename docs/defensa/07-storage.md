# 📘 Módulo 7 (desde 0) — Storage (Volúmenes, PV, PVC, StorageClass, NFS)

> El problema: un contenedor es DESECHABLE. Si muere, lo que guardó adentro se
> pierde. Storage = cómo hacer que los datos SOBREVIVAN.

## 7.1 El problema
Borras un pod -> nace otro vacío -> los datos de adentro DESAPARECEN.
Para una base de datos eso es inaceptable. Necesitamos guardar datos FUERA del pod.

## 7.2 emptyDir (volumen temporal)
Una carpeta que vive MIENTRAS el pod existe. Si el pod muere, se borra.
Sirve para: cache, datos temporales, compartir entre contenedores del MISMO pod.
  volumes:
  - name: cache
    emptyDir: {}
NO persiste. Es lo más simple.

## 7.3 hostPath (carpeta del nodo)
Monta una carpeta del NODO (la máquina) dentro del pod. Persiste en ESE nodo.
Problema: si el pod se mueve a otro nodo, NO encuentra sus datos. Solo para logs/pruebas.
  volumes:
  - name: logs
    hostPath: { path: /var/log }

## 7.4 PV y PVC (almacenamiento persistente de verdad)
Para datos que persisten SIEMPRE y son portables entre nodos:
- PV (PersistentVolume) = un pedazo de almacenamiento real disponible (la "oferta").
- PVC (PersistentVolumeClaim) = una solicitud de almacenamiento ("quiero 5Gi") (la "demanda").
- K8s une PVC con PV -> el pod usa el PVC.
Analogía: PV = depto disponible; PVC = solicitud de renta; binding = el contrato.

  # PVC: "quiero 5Gi"
  kind: PersistentVolumeClaim
  metadata: { name: app-pvc }
  spec:
    accessModes: ["ReadWriteOnce"]
    resources: { requests: { storage: 5Gi } }
    storageClassName: nfs-csi

  # el pod lo usa:
  volumes:
  - name: datos
    persistentVolumeClaim: { claimName: app-pvc }

Comandos:
  kubectl get pv                 # volúmenes disponibles
  kubectl get pvc -n micrositio  # solicitudes (STATUS Bound = ya conectado)
  kubectl describe pvc app-pvc

## 7.5 StorageClass (aprovisionamiento DINÁMICO)
Crear PVs a mano es tedioso. Una StorageClass los crea AUTOMÁTICAMENTE cuando
alguien pide un PVC. Tú solo creas el PVC y el PV aparece solo.
  kubectl get storageclass
La del profe / tu proyecto: "nfs-csi" (apunta a un servidor NFS).

## 7.6 NFS CSI Driver (el backend de almacenamiento)
NFS = un servidor de archivos en red (una carpeta compartida por la red).
CSI = el estándar que conecta K8s con sistemas de almacenamiento externos.
El "NFS CSI Driver" permite que K8s cree carpetas en el NFS automáticamente.
StorageClass del profe:
  provisioner: nfs.csi.k8s.io
  server: 192.168.109.210
  share: /srv/nfs/k8s-storage
  subDir: ${pvc.metadata.namespace}/${pvc.metadata.name}
Flujo: pides PVC -> el driver crea una subcarpeta en el NFS -> crea el PV -> Bound.

## 7.7 Conceptos que el profe pregunta
- accessModes:
  - ReadWriteOnce (RWO): lo monta UN nodo a la vez (lo normal para bases de datos).
  - ReadWriteMany (RWX): varios nodos a la vez (NFS lo permite).
- reclaimPolicy:
  - Delete: al borrar el PVC, se borra el dato.
  - Retain: se conserva el dato (producción).

## Lo que debes poder decir
- Contenedor desechable -> datos se pierden -> necesito storage persistente.
- emptyDir = temporal; hostPath = en el nodo (no portable); PV/PVC = persistente y portable.
- PV = oferta, PVC = solicitud, binding = unión. El pod usa el PVC.
- StorageClass = crea PVs automáticamente (dinámico). La tuya: nfs-csi.
- NFS = carpeta compartida en red; el CSI driver crea subcarpetas automáticamente.
- accessModes (RWO/RWX) y reclaimPolicy (Delete/Retain).
