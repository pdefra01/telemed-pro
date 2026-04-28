# Exploration: Medical AI Command Center (Gemini Integration)

### Current State
- **AI Service**: `geminiService.ts` exists on the frontend (GenAI SDK) and an edge function `ai-medical-assistant` exists on Supabase.
- **Notes Professionalization**: A button "AI MAGIC" in `VideoRoom.tsx` already calls the edge function to transform notes into SOAP format.
- **Video HUD**: The video room has a premium HUD showing technical metrics (latency, quality, security) but lacks medical intelligence visibility.
- **Context**: The system has access to patient history via `MedicalRecordRepository`.

### Affected Areas
- `src/pages/VideoRoom.tsx`: Needs to integrate the new AI HUD components and periodic context analysis.
- `src/components/ai/AiInsightHud.tsx` [NEW]: A floating component to display real-time AI suggestions.
- `supabase/functions/ai-medical-assistant/index.ts`: Needs a new action `generate_live_insights` to process current notes + history.
- `src/services/geminiService.ts`: (Optional) Can be used for client-side quick checks if latency is an issue, but Edge Functions are preferred for security/API keys.

### Approaches
1. **On-Demand AI Insights (Manual)**
   - Doctor clicks a "Get Insights" button.
   - Pros: Low cost, no unexpected UI shifts.
   - Cons: Friction; doctor might forget to use it.
   - Effort: Low.

2. **Reactive HUD (Note-driven)**
   - AI analyzes notes every X seconds (debounced) and updates a floating HUD.
   - Pros: Feels "magic", provides value without intervention.
   - Cons: Higher API cost, might be distracting if it updates too much.
   - Effort: Medium.

3. **Full Multimodal Assistant (Video/Audio analysis)**
   - Feed audio stream to Gemini for real-time transcription and insight.
   - Pros: State of the art, zero manual input.
   - Cons: Extremely high complexity (LiveKit Egress/Transcription + Gemini Multimodal), high cost.
   - Effort: High.

### Recommendation
I recommend **Approach 2 (Reactive HUD)**. It strikes a balance between "Wow factor" and technical feasibility. We can implement a "Zen AI HUD" that subtly appears in the video area when interesting insights are found (e.g., drug interactions, suspected diagnosis based on history + current notes).

### Risks
- **Hallucinations**: AI might suggest incorrect medical data. We MUST include heavy disclaimers.
- **Cost**: Frequent polling of Gemini can be expensive.
- **Privacy**: Patient data sent to Gemini must be handled according to HIPAA/GDPR (using official Google Cloud/Vertex privacy standards).

### Ready for Proposal
Yes. I can now draft the proposal for the "Medical AI Command Center" focusing on the reactive HUD and professionalized notes refinement.
