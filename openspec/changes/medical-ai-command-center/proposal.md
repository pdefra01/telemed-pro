# Proposal: Medical AI Command Center (Gemini Integration)

## Intent
Enhance the medical consultation experience with real-time AI intelligence using Gemini. The goal is to reduce doctor burnout by automating clinical note professionalization and providing a "Video HUD" with real-time diagnostic insights and history highlights.

## Scope

### In Scope
- **Reactive AI HUD**: A floating glassmorphism component in the video area that displays live insights (symptoms detected, history alerts).
- **Note Professionalization 2.0**: Enhanced SOAP transformation with better Argentine/Latam medical terminology.
- **Diagnostic Suggestions**: Side panel or HUD insights offering possible ICD-10 diagnoses based on current conversation/notes.
- **Debounced Context Analysis**: Efficient polling logic to send context to Gemini without overwhelming the API.

### Out of Scope
- Full audio transcription (deferring to future phase).
- Multi-language support (focus on Spanish Rioplatense).

## Capabilities

### New Capabilities
- `medical-ai-assistant`: Core logic for AI context analysis, insight generation, and medical terminology mapping.

### Modified Capabilities
- `doctor-flow`: Integration of the AI HUD and professionalization triggers into the `VideoRoom` and `PostConsultation` flows.

## Approach
Implement a **Reactive HUD** pattern. A React hook will monitor the `notes` state in `VideoRoom.tsx`. When a meaningful change is detected (debounced), it sends the current notes + patient history to the `ai-medical-assistant` edge function. The result (insights) is displayed in a new `AiInsightHud` component.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/pages/VideoRoom.tsx` | Modified | Integrate `AiInsightHud` and note-monitoring hook. |
| `src/components/ai/AiInsightHud.tsx` | New | Floating premium HUD component. |
| `supabase/functions/ai-medical-assistant/index.ts` | Modified | Add `analyze_live_context` action. |
| `src/services/geminiService.ts` | Modified | Add frontend types for AI insights. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Hallucinations | Med | Explicit "AI Suggested" labels and verification checkboxes. |
| Performance Lag | Low | Use debounced triggers and optimized edge functions. |
| API Cost | Med | Cache results for identical context; strict rate limiting. |

## Rollback Plan
Toggle off the AI HUD via a feature flag in `config.ts`. The system falls back to manual note-taking without disruption.

## Success Criteria
- [ ] AI successfully professionalizes raw notes into SOAP format in < 3s.
- [ ] HUD displays at least 2 relevant insights during a 5-minute mock consultation.
- [ ] Zero impact on video call performance (latency < 100ms constant).
