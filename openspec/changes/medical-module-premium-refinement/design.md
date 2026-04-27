# Design: Medical Module Premium Refinement

## Technical Approach

Refactorizar la página `PostConsultation.tsx` para implementar una UI de carga de medicamentos basada en componentes atómicos y un sistema de feedback de cierre (Success Overlay) que oculte la latencia de red bajo una capa de UX pulida.

## Architecture Decisions

### Decision: MedicationCard Component
**Choice**: Crear un componente interno `MedicationCard` dentro de `PostConsultation.tsx`.
**Alternatives considered**: Mantener el grid actual; crear un componente global en `src/components/ui`.
**Rationale**: Facilita la encapsulación de animaciones y validación local sin contaminar el componente principal, pero permite un acceso rápido al estado de la consulta.

### Decision: State Management for Closure
**Choice**: Usar un estado `closureStatus: 'idle' | 'processing' | 'success' | 'error'`.
**Alternatives considered**: Solo un booleano `isLoading`.
**Rationale**: Permite orquestar una secuencia de mensajes en el overlay (e.g. "Firmando receta...", "Actualizando historial...") que mejora la percepción de calidad.

### Decision: Mocked Suggestions
**Choice**: Array estático `COMMON_MEDS` exportado en una constante.
**Alternatives considered**: Llamar a una API de vademécum.
**Rationale**: Evita latencia y dependencia externa en esta fase de prototipado rápido, manteniendo la fluidez de la UI.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/pages/doctor/PostConsultation.tsx` | Modify | Implementación de `MedicationCard`, `CompletionOverlay` y lógica de validación. |
| `src/styles/animations.css` | New | Definición de keyframes para el Success Check y el Pulse de carga. |

## Data Flow

    Doctor Input ──→ Validation Hook ──→ Finalize Click ──→ [Set closureStatus: 'processing']
                                                                  │
                                                                  ▼
    [CompletionOverlay UI] ←── Status Update ←── Edge Function Response
              │
              ▼
    [Set closureStatus: 'success'] ──→ [Show SuccessState View]

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Validation Logic | Probar `isFormValid` con diferentes estados de medications. |
| Manual | Closure Experience | Verificar visualmente que el overlay aparezca y transicione correctamente. |
| Manual | Med Card UI | Probar agregar/quitar medicamentos y ver las sugerencias. |

## Open Questions

- [ ] ¿Queremos que el doctor pueda previsualizar el PDF antes de finalizar? (Asumo que no por ahora para mantener el flujo rápido).
