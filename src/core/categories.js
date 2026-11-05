// Half-life in days: how fast a claim of this kind typically goes stale.
export const CATEGORIES = {
  version: { label: 'Version / release', halfLife: 45 },
  api: { label: 'API / SDK usage', halfLife: 90 },
  model: { label: 'AI model', halfLife: 60 },
  pricing: { label: 'Pricing / limits', halfLife: 60 },
  company: { label: 'Company / people', halfLife: 180 },
  policy: { label: 'Law / policy', halfLife: 365 },
  stable: { label: 'Stable fact', halfLife: 3650 },
};

export function categoryOf(name) {
  return CATEGORIES[name] ? name : 'stable';
}
