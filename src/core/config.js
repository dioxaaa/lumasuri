export const config = {
  bifrostUrl: process.env.BIFROST_URL || 'http://127.0.0.1:8080',
  bifrostVirtualKey: process.env.BIFROST_VIRTUAL_KEY || 'sk-bf-lumasuri-dev',
  extractModel: process.env.LUMASURI_EXTRACT_MODEL || 'ollama/qwen2.5:3b',
  verdictModel: process.env.LUMASURI_VERDICT_MODEL || 'ollama/qwen2.5:3b',
  fallbacks: (process.env.LUMASURI_FALLBACKS || 'ollama/qwen2.5:3b,ollama/qwen2.5:1.5b').split(',').map((s) => s.trim()).filter(Boolean),
  outageModel: process.env.LUMASURI_OUTAGE_MODEL || 'openai/gpt-4o-mini',
  tavilyKey: process.env.TAVILY_API_KEY || '',
  maxTokensPerRun: Number(process.env.LUMASURI_MAX_TOKENS_PER_RUN || 60000),
  concurrency: Number(process.env.LUMASURI_CONCURRENCY || 2),
  dbPath: process.env.LUMASURI_DB || 'data/lumasuri.db',
  port: Number(process.env.PORT || 3311),
};
