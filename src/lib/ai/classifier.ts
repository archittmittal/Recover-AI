import { gemini } from './gemini';
import { CLASSIFICATION_SYSTEM_PROMPT } from './prompts';
import { sanitizePromptInput } from './sanitize';
import {
  ClassificationInput,
  ClassificationResult,
  classifyFailureDeterministic,
} from '../recovery/classifier';

export async function classifyFailureWithLLM(
  input: ClassificationInput
): Promise<ClassificationResult> {
  const deterministicResult = classifyFailureDeterministic(input);

  // If deterministic classification is already confident and unambiguous, use it directly (fast, free, accurate)
  if (deterministicResult.strategy !== null && deterministicResult.confidence >= 0.95) {
    return deterministicResult;
  }

  // If Gemini model is not configured, fall back to deterministic
  const model = gemini.getModel();
  if (!model) {
    return deterministicResult;
  }

  try {
    // These fields originate from Razorpay's payment error_* attributes, which are
    // typed as open strings — contain them before they reach the prompt (RA-03).
    const prompt = `
Analyze this payment failure payload:
- error_source: "${sanitizePromptInput(input.errorSource, 60)}"
- error_step: "${sanitizePromptInput(input.errorStep, 60)}"
- error_code: "${sanitizePromptInput(input.errorCode, 60)}"
- error_reason: "${sanitizePromptInput(input.errorReason, 60)}"
- failure_type: "${sanitizePromptInput(input.failureType, 60)}"
- customer_segment: "${sanitizePromptInput(input.customerSegment || 'b2c', 30)}"
- amount_in_paise: ${input.amount || 0}
`;

    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: `${CLASSIFICATION_SYSTEM_PROMPT}\n${prompt}` }] },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    if (parsed && parsed.recommended_strategy && parsed.confidence !== undefined) {
      return {
        strategy: parsed.recommended_strategy,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning || 'Classified via Gemini 2.5 Flash contextual reasoning.',
        isDeterministic: false,
        category: parsed.category || 'LLM_CLASSIFIED',
      };
    }
  } catch (error) {
    console.error('[ai:classifyFailureWithLLM] Error calling Gemini, using fallback:', error);
  }

  return deterministicResult;
}
