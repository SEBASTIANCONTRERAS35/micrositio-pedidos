# ADR-001: Calico CNI en vez de Canal o Flannel

**Fecha:** 13 de mayo de 2026
**Estado:** Aceptado

## Contexto

El cluster Kubernetes requiere un Container Network Interface (CNI) que implemente
NetworkPolicy. La infraestructura del laboratorio universitario tradicionalmente usa
Flannel.

## Decision

Usamos **Calico** (no Flannel solo, no Canal).

## Razones

1. **Flannel solo NO implementa NetworkPolicy.** Esto es un requisito explicito de la
   rubrica de Daniel Guerrero (15 puntos). Sin un CNI con NetworkPolicy enforcement,
   no podemos demostrar la demo de aislamiento (pod rogue bloqueado).

2. **Canal (Flannel + Calico) fue archivado por projectcalico/canal el 20 de octubre
   de 2025.** El repositorio ya no recibe mantenimiento. Aunque sigue funcionando,
   usar un proyecto deprecado es mala practica de produccion.

3. **Calico puro provee:**
   - Networking entre pods (reemplaza la necesidad de Flannel)
   - NetworkPolicy enforcement
   - Mantenimiento activo por Tigera
   - Documentacion actualizada en docs.tigera.io
   - Soporte opcional de eBPF para mejor performance

## Alternativas consideradas

- **Cilium**: tambien moderno y con eBPF, pero curva de aprendizaje mayor para 23 dias
  de proyecto
- **Weave Net**: bajo mantenimiento, no recomendado en 2026

## Consecuencias

- Manifiestos Calico oficiales aplicados desde docs.tigera.io
- NetworkPolicies estandar de K8s funcionan tal cual
- Performance similar a Flannel para nuestro caso de uso (cluster pequeño)
