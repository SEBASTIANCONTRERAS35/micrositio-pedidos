# ADR-006: NFS storage para MongoDB es deuda técnica aceptable (no para producción)

**Fecha:** 2026-05-16
**Estado:** Aceptado (proyecto académico)
**Decisores:** Sebastián Contreras

## Contexto

El cluster del proyecto académico tiene como único storage CSI disponible `nfs-csi` apuntando
a un NFS server en el nodo master. MongoDB 7 Replica Set 3 nodos requiere PVCs `ReadWriteOnce`
con persistencia confiable.

La documentación oficial de MongoDB **desaconseja explícitamente** correr WiredTiger sobre NFS:

> Many MongoDB users [...] choose to use NFS as a remote filesystem. [...] We do not recommend NFS.

Razones:

1. NFS no garantiza el ordering de `fsync()` requerido por el journal
2. `flock()` puede fallar con `EBADF` bajo carga
3. Latencia de red puede provocar elecciones espurias del Replica Set
4. Reads stale debido al cache cliente NFS

## Decisión

**Aceptamos esta deuda técnica para el proyecto académico** porque:

1. **No tenemos block storage disponible** (no hay CSI para iSCSI, Ceph, Longhorn instalado, ni cloud disk)
2. **El demo de Daniel solo requiere demostrar 1 PRIMARY + 2 SECONDARY y un failover** — no carga
   sostenida real
3. **No hay datos críticos**: la BD se recrea por demo, no almacenamos info de producción
4. **El esfuerzo de migrar a block storage local** (instalar OpenEBS LocalPV o Longhorn) excedería
   el valor del proyecto

## Mitigaciones aplicadas

- `mountOptions: [nfsvers=4.1, hard, timeo=600]` — minimiza fallos transitorios
- `no_root_squash` en exports — evita problemas de permisos
- `failureThreshold: 5 + timeoutSeconds: 10` en probes para tolerar latencia NFS
- Backup de datos importante NO se hace (demo data)

## Camino a producción real

Si este proyecto saliera a producción real:

1. **Migrar storage a block** (Longhorn, OpenEBS LocalPV, o cloud-provider CSI)
2. **Operator MongoDB** (Bitnami / Percona) en lugar de StatefulSet manual
3. **Backups automatizados** con Velero + S3-compatible storage
4. **Anti-affinity hard** en lugar de soft (1 réplica por nodo garantizado)

## Referencias

- [MongoDB on NFS - oficial](https://www.mongodb.com/docs/manual/administration/production-checklist-operations/#filesystem)
- [Longhorn vs NFS comparison](https://longhorn.io/docs/)
