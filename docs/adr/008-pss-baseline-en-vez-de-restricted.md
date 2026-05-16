# ADR-008: Pod Security Standards `baseline` (no `restricted`) en namespace `micrositio`

**Fecha:** 2026-05-16
**Estado:** Aceptado
**Decisores:** Sebastián Contreras

## Contexto

Los Pod Security Standards (PSS) de Kubernetes 1.25+ tienen 3 niveles:

| Nivel        | Permite                               | Bloquea                                                                               |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------------------- |
| `privileged` | Todo                                  | Nada                                                                                  |
| `baseline`   | Lo esperable de cargas tipo "app web" | privileged, hostNetwork, hostPID, capabilities peligrosas                             |
| `restricted` | Solo lo estrictamente seguro          | runAsRoot, capabilities.add no vacío, readOnlyRootFilesystem=false, runAsUser=0, etc. |

La idea original era usar `restricted` en `micrositio` para máxima defensa en profundidad.

## Problema descubierto

El StatefulSet de MongoDB tiene un **init container `copy-keyfile`** que necesita:

- `runAsUser: 0` (root) — para chown
- `capabilities.add: ["CHOWN", "DAC_OVERRIDE"]` — para cambiar ownership del keyfile

Esto es necesario porque MongoDB requiere que el keyfile (Replica Set internal auth) sea propiedad
del usuario mongodb (uid 999) con permisos `0400`. El init container monta el Secret (que viene
como root-owned 0444) y lo copia con permisos correctos antes de que mongod arranque.

PSS `restricted` rechaza este pod con:

```
pods "mongodb-0" is forbidden: violates PodSecurity "restricted:latest":
  - unrestricted capabilities (container "copy-keyfile" must not include "CHOWN", "DAC_OVERRIDE")
  - runAsNonRoot != true
  - runAsUser=0
```

## Decisión

**Usar `baseline` en `enforce` (no `restricted`)**, manteniendo `restricted` en `audit` y `warn`:

```yaml
labels:
  pod-security.kubernetes.io/enforce: baseline # permite mongo init
  pod-security.kubernetes.io/audit: restricted # registra violaciones
  pod-security.kubernetes.io/warn: restricted # avisa al apply
```

`baseline` aún bloquea:

- `hostNetwork: true` (salvo ingress-nginx en otro ns)
- `hostPID`, `hostIPC`
- `privileged: true`
- `allowPrivilegeEscalation: true` en contextos sin justificación

## Alternativas descartadas

1. **Operator de MongoDB** (Bitnami / Percona) — instala todos los pods con runAsUser=1001 sin
   necesidad de init container. Solución correcta para producción, pero añade complejidad
   (CRDs adicionales, gestión por operator).
2. **InitContainer en `securityContext` separado de `restricted`** — PSS no permite excepciones
   por container, es a nivel pod.
3. **Mover el chown al imagen mongo:7.0** — requiere mantener fork de la imagen oficial.

## Compensaciones de seguridad

Aunque relajamos PSS, mantenemos:

- **NetworkPolicy default-deny** en `micrositio` y todas las namespaces de la app
- **runAsNonRoot: true** en api, worker, redis (todos cumplen restricted)
- **readOnlyRootFilesystem: true** en api
- **capabilities.drop: [ALL]** en api
- **Secrets externos** (no hardcodeados en repo, solo .example.yaml)
- **AnalysisTemplate** para rollback automático si error rate sube

## Resultado

PSS baseline permite que mongo init corra, sin abrir privileged/hostNetwork. Defensa en profundidad
sigue intacta vía NetworkPolicy + securityContext de los pods de la app.
