# Guía de Contribución

> Este es un proyecto académico personal. La guía está pensada para mantener
> consistencia durante el desarrollo del autor.

## Convenciones de commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: agregar endpoint de creación de pedido
fix: corregir cálculo de stock concurrente
docs: actualizar README con instrucciones K8s
chore: bump dependencias
refactor: simplificar lógica de webhooks
test: agregar tests de atomicidad
```

Los commits se validan automáticamente con `commitlint` en pre-commit hook.

## Branching

- `main` — producción (ArgoCD apunta acá)
- Commits directos a `main` durante desarrollo (proyecto solo)
- Pre-commit hooks corren `lint-staged` antes de cada commit

## Estilo de código

- ESLint flat config + Prettier
- Pre-commit hook formatea automáticamente
- 100 caracteres de ancho máximo
- Sin punto y coma omitidos
- Comillas simples

## Tests

- Coverage mínimo: 80%
- Tests unitarios con Vitest + mocks
- Tests de integración con Testcontainers (Mongo + Redis reales)
- Tests de webhook con MSW

## Manifiestos Kubernetes

- Cada manifiesto debe pasar `kubectl apply --dry-run=server`
- securityContext: runAsNonRoot, readOnlyRootFilesystem siempre
- ResourceRequests y Limits siempre
- Liveness, readiness, startup probes en Deployments

## Antes de subir a `main`

```bash
npm run lint
npm test
npm run audit:security
```

Si todo pasa, commit y push.
