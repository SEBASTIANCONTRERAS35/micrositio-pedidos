# ADR-003: Vitest en vez de Jest

**Fecha:** 13 de mayo de 2026
**Estado:** Aceptado

## Decision

Usamos **Vitest 2.1+** en vez de Jest.

## Razones

1. **Vitest es mas rapido.** En proyectos con BullMQ + Mongoose, los tests de Vitest
   corren ~2-3x mas rapido por su ESM-native architecture.

2. **API compatible con Jest.** describe/it/expect funcionan igual, no hay curva de
   aprendizaje. La migracion futura a Jest seria trivial si fuera necesario.

3. **Coverage built-in con v8.** Sin necesidad de instalar y configurar `nyc` o
   `c8` por separado.

4. **Mejor integracion con Testcontainers.** Los tests de integracion con MongoDB
   real responden mejor en Vitest por el handling de timeouts.

## Consecuencias

- `package.json` con `vitest`, `@vitest/coverage-v8`
- 2 configs separadas: `vitest.config.js` (unit) y `vitest.integration.config.js`
  (timeouts mas largos)
- Coverage threshold 70% (statements, branches, functions, lines)
