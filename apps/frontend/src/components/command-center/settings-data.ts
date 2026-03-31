/**
 * @module components/command-center/settings-data
 * @description Shared data constants and helpers for Settings tab components.
 * MODEL_CATALOG, PROVIDERS, PROVIDER_META, category labels, helpers.
 */

export type AiProvider = 'anthropic' | 'openai' | 'google'

export interface ModelDefinition {
  id: string; provider: AiProvider; displayName: string
  pricing: { inputPer1M: number; outputPer1M: number }
  benchmarks: { subtask: string; accuracy: number }[]
}

export const MODEL_CATALOG: ModelDefinition[] = [
  { id: 'claude-opus-4-6', provider: 'anthropic', displayName: 'Claude Opus 4.6', pricing: { inputPer1M: 15, outputPer1M: 75 }, benchmarks: [{ subtask: 'triage', accuracy: 88 }, { subtask: 'extraction', accuracy: 96 }, { subtask: 'classification', accuracy: 95 }, { subtask: 'summarization', accuracy: 96 }, { subtask: 'translation', accuracy: 93 }, { subtask: 'risk_scoring', accuracy: 96 }, { subtask: 'context_gen', accuracy: 95 }, { subtask: 'attribution', accuracy: 96 }, { subtask: 'campaign_link', accuracy: 93 }, { subtask: 'false_positive', accuracy: 88 }, { subtask: 'exec_summary', accuracy: 96 }, { subtask: 'technical_detail', accuracy: 95 }, { subtask: 'trend_analysis', accuracy: 94 }, { subtask: 'recommendation', accuracy: 90 }, { subtask: 'formatting', accuracy: 88 }] },
  { id: 'claude-sonnet-4-6', provider: 'anthropic', displayName: 'Claude Sonnet 4.6', pricing: { inputPer1M: 3, outputPer1M: 15 }, benchmarks: [{ subtask: 'triage', accuracy: 84 }, { subtask: 'extraction', accuracy: 92 }, { subtask: 'classification', accuracy: 91 }, { subtask: 'summarization', accuracy: 92 }, { subtask: 'translation', accuracy: 89 }, { subtask: 'risk_scoring', accuracy: 94 }, { subtask: 'context_gen', accuracy: 92 }, { subtask: 'attribution', accuracy: 92 }, { subtask: 'campaign_link', accuracy: 89 }, { subtask: 'false_positive', accuracy: 84 }, { subtask: 'exec_summary', accuracy: 93 }, { subtask: 'technical_detail', accuracy: 91 }, { subtask: 'trend_analysis', accuracy: 90 }, { subtask: 'recommendation', accuracy: 85 }, { subtask: 'formatting', accuracy: 83 }] },
  { id: 'claude-haiku-4-5', provider: 'anthropic', displayName: 'Claude Haiku 4.5', pricing: { inputPer1M: 0.8, outputPer1M: 4 }, benchmarks: [{ subtask: 'triage', accuracy: 78 }, { subtask: 'extraction', accuracy: 80 }, { subtask: 'classification', accuracy: 79 }, { subtask: 'summarization', accuracy: 78 }, { subtask: 'translation', accuracy: 76 }, { subtask: 'risk_scoring', accuracy: 80 }, { subtask: 'context_gen', accuracy: 78 }, { subtask: 'attribution', accuracy: 76 }, { subtask: 'campaign_link', accuracy: 74 }, { subtask: 'false_positive', accuracy: 78 }, { subtask: 'exec_summary', accuracy: 76 }, { subtask: 'technical_detail', accuracy: 74 }, { subtask: 'trend_analysis', accuracy: 72 }, { subtask: 'recommendation', accuracy: 76 }, { subtask: 'formatting', accuracy: 74 }] },
  { id: 'o3', provider: 'openai', displayName: 'o3', pricing: { inputPer1M: 10, outputPer1M: 40 }, benchmarks: [{ subtask: 'triage', accuracy: 86 }, { subtask: 'extraction', accuracy: 94 }, { subtask: 'classification', accuracy: 93 }, { subtask: 'summarization', accuracy: 93 }, { subtask: 'translation', accuracy: 91 }, { subtask: 'risk_scoring', accuracy: 95 }, { subtask: 'context_gen', accuracy: 93 }, { subtask: 'attribution', accuracy: 95 }, { subtask: 'campaign_link', accuracy: 91 }, { subtask: 'false_positive', accuracy: 86 }, { subtask: 'exec_summary', accuracy: 94 }, { subtask: 'technical_detail', accuracy: 93 }, { subtask: 'trend_analysis', accuracy: 92 }, { subtask: 'recommendation', accuracy: 88 }, { subtask: 'formatting', accuracy: 85 }] },
  { id: 'gpt-4o', provider: 'openai', displayName: 'GPT-4o', pricing: { inputPer1M: 2.5, outputPer1M: 10 }, benchmarks: [{ subtask: 'triage', accuracy: 82 }, { subtask: 'extraction', accuracy: 89 }, { subtask: 'classification', accuracy: 88 }, { subtask: 'summarization', accuracy: 89 }, { subtask: 'translation', accuracy: 87 }, { subtask: 'risk_scoring', accuracy: 90 }, { subtask: 'context_gen', accuracy: 89 }, { subtask: 'attribution', accuracy: 88 }, { subtask: 'campaign_link', accuracy: 86 }, { subtask: 'false_positive', accuracy: 82 }, { subtask: 'exec_summary', accuracy: 90 }, { subtask: 'technical_detail', accuracy: 88 }, { subtask: 'trend_analysis', accuracy: 87 }, { subtask: 'recommendation', accuracy: 83 }, { subtask: 'formatting', accuracy: 81 }] },
  { id: 'o3-mini', provider: 'openai', displayName: 'o3-mini', pricing: { inputPer1M: 1.1, outputPer1M: 4.4 }, benchmarks: [{ subtask: 'triage', accuracy: 80 }, { subtask: 'extraction', accuracy: 85 }, { subtask: 'classification', accuracy: 83 }, { subtask: 'summarization', accuracy: 84 }, { subtask: 'translation', accuracy: 82 }, { subtask: 'risk_scoring', accuracy: 86 }, { subtask: 'context_gen', accuracy: 84 }, { subtask: 'attribution', accuracy: 83 }, { subtask: 'campaign_link', accuracy: 80 }, { subtask: 'false_positive', accuracy: 80 }, { subtask: 'exec_summary', accuracy: 84 }, { subtask: 'technical_detail', accuracy: 82 }, { subtask: 'trend_analysis', accuracy: 81 }, { subtask: 'recommendation', accuracy: 80 }, { subtask: 'formatting', accuracy: 78 }] },
  { id: 'gpt-4o-mini', provider: 'openai', displayName: 'GPT-4o Mini', pricing: { inputPer1M: 0.15, outputPer1M: 0.6 }, benchmarks: [{ subtask: 'triage', accuracy: 76 }, { subtask: 'extraction', accuracy: 79 }, { subtask: 'classification', accuracy: 81 }, { subtask: 'summarization', accuracy: 78 }, { subtask: 'translation', accuracy: 77 }, { subtask: 'risk_scoring', accuracy: 78 }, { subtask: 'context_gen', accuracy: 76 }, { subtask: 'attribution', accuracy: 74 }, { subtask: 'campaign_link', accuracy: 72 }, { subtask: 'false_positive', accuracy: 76 }, { subtask: 'exec_summary', accuracy: 74 }, { subtask: 'technical_detail', accuracy: 72 }, { subtask: 'trend_analysis', accuracy: 70 }, { subtask: 'recommendation', accuracy: 74 }, { subtask: 'formatting', accuracy: 72 }] },
  { id: 'gemini-2.5-pro', provider: 'google', displayName: 'Gemini 2.5 Pro', pricing: { inputPer1M: 1.25, outputPer1M: 10 }, benchmarks: [{ subtask: 'triage', accuracy: 83 }, { subtask: 'extraction', accuracy: 90 }, { subtask: 'classification', accuracy: 89 }, { subtask: 'summarization', accuracy: 90 }, { subtask: 'translation', accuracy: 91 }, { subtask: 'risk_scoring', accuracy: 91 }, { subtask: 'context_gen', accuracy: 90 }, { subtask: 'attribution', accuracy: 88 }, { subtask: 'campaign_link', accuracy: 85 }, { subtask: 'false_positive', accuracy: 83 }, { subtask: 'exec_summary', accuracy: 90 }, { subtask: 'technical_detail', accuracy: 88 }, { subtask: 'trend_analysis', accuracy: 88 }, { subtask: 'recommendation', accuracy: 84 }, { subtask: 'formatting', accuracy: 82 }] },
  { id: 'gemini-2.5-flash', provider: 'google', displayName: 'Gemini 2.5 Flash', pricing: { inputPer1M: 0.15, outputPer1M: 0.6 }, benchmarks: [{ subtask: 'triage', accuracy: 75 }, { subtask: 'extraction', accuracy: 78 }, { subtask: 'classification', accuracy: 77 }, { subtask: 'summarization', accuracy: 76 }, { subtask: 'translation', accuracy: 79 }, { subtask: 'risk_scoring', accuracy: 76 }, { subtask: 'context_gen', accuracy: 74 }, { subtask: 'attribution', accuracy: 72 }, { subtask: 'campaign_link', accuracy: 70 }, { subtask: 'false_positive', accuracy: 74 }, { subtask: 'exec_summary', accuracy: 74 }, { subtask: 'technical_detail', accuracy: 72 }, { subtask: 'trend_analysis', accuracy: 70 }, { subtask: 'recommendation', accuracy: 72 }, { subtask: 'formatting', accuracy: 74 }] },
]

export const PROVIDER_META: Record<AiProvider, { label: string; color: string; keyPrefix: string }> = {
  anthropic: { label: 'Anthropic', color: '#8b5cf6', keyPrefix: 'sk-ant-' },
  openai:    { label: 'OpenAI',    color: '#10b981', keyPrefix: 'sk-' },
  google:    { label: 'Google',    color: '#f59e0b', keyPrefix: 'AIza' },
}

export const PROVIDERS: { id: AiProvider; label: string; color: string; models: string[] }[] = [
  { id: 'anthropic', label: 'Anthropic', color: '#8b5cf6', models: ['Claude Opus 4.6', 'Claude Sonnet 4.6', 'Claude Haiku 4.5'] },
  { id: 'openai', label: 'OpenAI', color: '#10b981', models: ['o3', 'GPT-4o', 'o3-mini', 'GPT-4o Mini'] },
  { id: 'google', label: 'Google', color: '#f59e0b', models: ['Gemini 2.5 Pro', 'Gemini 2.5 Flash'] },
]

export const CATEGORY_LABELS: Record<string, string> = {
  news_feed: 'News Feed Processing',
  ioc_enrichment: 'IOC Enrichment',
  reporting: 'Reporting',
}

export function getAccuracy(modelId: string, subtask: string): number {
  return MODEL_CATALOG.find(m => m.id === modelId)?.benchmarks.find(b => b.subtask === subtask)?.accuracy ?? 0
}

export function estimatePerItemCost(modelId: string, inputTokens = 1000, outputTokens = 300): number {
  const m = MODEL_CATALOG.find(m => m.id === modelId)
  if (!m) return 0
  return Math.round(((inputTokens * m.pricing.inputPer1M + outputTokens * m.pricing.outputPer1M) / 1_000_000) * 1_000_000) / 1_000_000
}

export function formatSubtask(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
