export class BudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export function createUsage(maxTokens) {
  return {
    maxTokens,
    llmCalls: 0,
    promptTokens: 0,
    completionTokens: 0,
    cacheHits: 0,
    fallbacks: [],
    models: {},
    tavilySearches: 0,
    registryChecks: 0,
    skippedStable: 0,
    budgetStopped: false,
    get totalTokens() {
      return this.promptTokens + this.completionTokens;
    },
    toJSON() {
      const { maxTokens: _m, toJSON: _t, ...rest } = this;
      return { ...rest, totalTokens: this.totalTokens, maxTokens };
    },
  };
}
