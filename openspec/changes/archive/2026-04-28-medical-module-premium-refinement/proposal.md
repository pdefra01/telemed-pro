# Proposal: Medical Module Premium Refinement

## Intent

Elevar la experiencia del médico al finalizar una consulta. Actualmente el flujo es funcional pero básico; buscamos una estética "Zen Dark" premium con micro-interacciones, validación proactiva y un feedback de cierre que transmita solidez técnica ("Solid Foundations").

## Scope

### In Scope
- **Refined Medication Input**: Componente de carga de medicamentos con cards visuales, eliminación suave y sugerencias locales (mocked).
- **Consultation Closure Experience**: Overlay de alta fidelidad durante el proceso de finalización (animaciones de "Generando Receta", "Notificando Paciente").
- **Success State**: Pantalla de éxito post-cierre con acciones rápidas (volver al dashboard, ver resumen).
- **Input Validation**: Feedback visual inmediato si faltan campos obligatorios antes de habilitar el botón de cierre.

### Out of Scope
- **IA Patient Summary**: Postergado para una release futura.
- **External Drug DB Integration**: Se usará una lista estática de medicamentos comunes para el prototipo.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `doctor-flow`: Refinar los criterios de validación y la experiencia visual del cierre de consulta.

## Approach

1.  **Refactor `PostConsultation.tsx`**: Extraer la lógica de la lista de medicamentos a un componente interno más robusto.
2.  **Implement `SuccessOverlay`**: Crear un componente de superposición que se active al disparar `handleFinalize`.
3.  **UI/UX Refinement**: Aplicar gradientes animados, glassmorphism extremo y tipografía moderna para los feedbacks de error/validación.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/pages/doctor/PostConsultation.tsx` | Modified | Principal punto de cambio en la UI de carga y cierre. |
| `src/components/ui` | New/Modified | Posibles nuevos componentes de visualización premium (Cards, Overlays). |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Interrupción de la lógica de guardado actual | Low | Mantener la estructura de datos `medications` compatible con el backend actual. |
| Sobrecarga visual | Low | Seguir los principios de diseño "Zen Dark" (minimalismo elegante). |

## Rollback Plan

Revertir los cambios en `PostConsultation.tsx` a la versión previa (tag de git o backup manual). La lógica de backend (Edge Functions) permanece intacta.

## Dependencies

- Ninguna externa.

## Success Criteria

- [ ] El doctor puede cargar múltiples medicamentos con una UI tipo "Card" visualmente atractiva.
- [ ] El proceso de cierre muestra un overlay con al menos 2 estados de progreso animados.
- [ ] El botón "Finalizar Consulta" solo se habilita (o muestra feedback) cuando los datos mínimos están completos.
