# ADR-002: JavaScript en vez de TypeScript

**Fecha:** 13 de mayo de 2026
**Estado:** Aceptado

## Contexto

Proyecto greenfield con deadline de 23 dias. La validacion de inputs se requiere ya sea
con TypeScript o con runtime validation. El equipo tiene experiencia con ambos.

## Decision

Usamos **JavaScript puro** con validacion runtime via Zod.

## Razones

1. **El deadline es duro (5 jun).** Configurar TypeScript con build pipeline + tipos
   para Express, Mongoose, BullMQ, EJS toma 1-2 dias adicionales.

2. **Zod cubre el caso de uso real.** El valor de TypeScript en backend es validar
   inputs externos. Zod hace esto en runtime, que es lo que importa para seguridad.

3. **EJS templates no benefician de TypeScript.** El motor de templates es HTML
   con interpolacion, no codigo tipado.

4. **El profe no califica TypeScript.** La rubrica evalua K8s, no Node.js.

5. **Migrar despues es facil.** Si ZUYU adopta el codigo en produccion y quiere
   TypeScript, agregar `// @ts-check` + JSDoc + `tsconfig` es incremental.

## Consecuencias

- Sin compilation step, mas rapido el ciclo dev
- Imagen Docker mas pequeña (sin tsc)
- Menos seguridad de tipos en internals (mitigado con Zod en boundaries)
- ESLint mas estricto (no-unused-vars, prefer-const, eqeqeq)
