import { config } from './config.js';
import { BudgetExceededError } from './usage.js';

function parseJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error(`Model did not return JSON: ${cleaned.slice(0, 200)}`);
  }
}

export function createBifrostChat({ fetchImpl = fetch } = {}) {
  return async function chat({ step, messages, usage, simulateOutage = false, cacheKey = 'lumasuri', maxTokens = 700 }) {
    if (usage && usage.totalTokens >= usage.maxTokens) {
      usage.budgetStopped = true;
      throw new BudgetExceededError(`Per-run token budget of ${usage.maxTokens} reached`);
    }
    const primary = step === 'extract' ? config.extractModel : config.verdictModel;
    const model = simulateOutage ? config.outageModel : primary;
    const fallbacks = [...new Set([...(simulateOutage ? [primary] : []), ...config.fallbacks])].filter((m) => m !== model);
    const res = await fetchImpl(`${config.bifrostUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bf-vk': config.bifrostVirtualKey,
        'x-bf-cache-key': cacheKey,
      },
      body: JSON.stringify({ model, fallbacks, messages, temperature: 0, max_tokens: maxTokens }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 402 || res.status === 429 || /budget|rate limit/i.test(body?.error?.message || '')) {
      if (usage) usage.budgetStopped = true;
      throw new BudgetExceededError(body?.error?.message || `Bifrost refused the call (${res.status})`);
    }
    if (!res.ok) throw new Error(`Bifrost error ${res.status}: ${body?.error?.message || JSON.stringify(body).slice(0, 200)}`);
    const extra = body.extra_fields || {};
    const routing = extra.routing_info || {};
    const meta = {
      step,
      provider: routing.provider || extra.provider,
      model: routing.model || extra.resolved_model_used,
      isFallback: Boolean(routing.is_fallback),
      primary: routing.primary_provider ? `${routing.primary_provider}/${routing.primary_model}` : model,
      cacheHit: Boolean(extra.cache_debug?.cache_hit),
      latencyMs: extra.latency,
      promptTokens: body.usage?.prompt_tokens || 0,
      completionTokens: body.usage?.completion_tokens || 0,
    };
    if (usage) {
      usage.llmCalls += 1;
      if (meta.cacheHit) usage.cacheHits += 1;
      else {
        usage.promptTokens += meta.promptTokens;
        usage.completionTokens += meta.completionTokens;
      }
      const key = `${meta.provider}/${meta.model}`;
      usage.models[key] = (usage.models[key] || 0) + 1;
      if (meta.isFallback) usage.fallbacks.push({ step, from: meta.primary, to: key });
    }
    const content = body.choices?.[0]?.message?.content || '';
    return { content, json: () => parseJson(content), meta };
  };
}

export { parseJson };
