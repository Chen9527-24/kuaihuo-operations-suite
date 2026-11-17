import type { CustomerServiceConversationStateSummary } from '../../runtime/state/customer-service-conversation-state.type';
import { estimateCustomerServiceRuntimeTextTokens } from './customer-service-knowledge.util';
import type { CustomerServiceConversationStrategyPreferences } from './customer-service-account-runtime-preferences.util';

export type CustomerServiceRuntimeInputBudget = {
  source: 'STORE_PROFILE' | 'ACCOUNT_PROFILE' | 'SYSTEM_DEFAULT';
  mode: 'AUTO' | 'CUSTOM';
  totalTokenBudget: number;
  reservedInstructionTokens: number;
  estimatedConversationTokens: number;
  estimatedIdentityTokens: number;
  knowledgeTokenBudget: number;
  estimatedKnowledgeTokens: number;
  estimatedRuntimeInputTokens: number;
  budgetExceeded: boolean;
};

const DEFAULT_TOTAL_INPUT_TOKEN_BUDGET = 8000;
const DEFAULT_RESERVED_INSTRUCTION_TOKENS = 1800;
const DEFAULT_MAX_KNOWLEDGE_TOKENS = 2200;

export function planCustomerServiceRuntimeInputBudget(input: {
  latestMessage: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  conversationState?: CustomerServiceConversationStateSummary | null;
  activeContextWindow?: Record<string, unknown> | null;
  storeProfile?: unknown;
  accountProfile?: unknown;
  conversationStrategy?: CustomerServiceConversationStrategyPreferences | null;
}): CustomerServiceRuntimeInputBudget {
  const strategy = input.conversationStrategy || null;
  const customBudget = strategy?.policy.contextBudget.mode === 'CUSTOM' ? strategy.policy.contextBudget : null;
  const totalTokenBudget = customBudget?.totalInputTokenBudget ?? readBoundedEnvInt(
    'CUSTOMER_SERVICE_RUNTIME_INPUT_TOKEN_BUDGET',
    DEFAULT_TOTAL_INPUT_TOKEN_BUDGET,
    4096,
    24000,
  );
  const reservedInstructionTokens = customBudget?.reservedInstructionTokens ?? readBoundedEnvInt(
    'CUSTOMER_SERVICE_RUNTIME_RESERVED_INSTRUCTION_TOKENS',
    DEFAULT_RESERVED_INSTRUCTION_TOKENS,
    800,
    5000,
  );
  const maxKnowledgeTokens = customBudget?.maxKnowledgeTokens ?? readBoundedEnvInt(
    'CUSTOMER_SERVICE_RUNTIME_MAX_KNOWLEDGE_TOKENS',
    DEFAULT_MAX_KNOWLEDGE_TOKENS,
    256,
    6000,
  );
  const estimatedConversationTokens = estimateConversationTokens(input);
  const estimatedIdentityTokens = estimateCustomerServiceRuntimeTextTokens(
    safeJson({ storeProfile: input.storeProfile || null, accountProfile: input.accountProfile || null }),
  );
  const availableForKnowledge = Math.max(
    0,
    totalTokenBudget - reservedInstructionTokens - estimatedConversationTokens - estimatedIdentityTokens,
  );
  const knowledgeTokenBudget = Math.min(maxKnowledgeTokens, availableForKnowledge);
  const estimatedRuntimeInputTokens = reservedInstructionTokens
    + estimatedConversationTokens
    + estimatedIdentityTokens;
  return {
    source: customBudget ? (strategy?.source || 'SYSTEM_DEFAULT') : 'SYSTEM_DEFAULT',
    mode: customBudget ? 'CUSTOM' : 'AUTO',
    totalTokenBudget,
    reservedInstructionTokens,
    estimatedConversationTokens,
    estimatedIdentityTokens,
    knowledgeTokenBudget,
    estimatedKnowledgeTokens: 0,
    estimatedRuntimeInputTokens,
    budgetExceeded: estimatedRuntimeInputTokens > totalTokenBudget,
  };
}

export function finalizeCustomerServiceRuntimeInputBudget(
  plan: CustomerServiceRuntimeInputBudget,
  selectedKnowledge: Array<{ estimatedTokens?: number; title?: string; question?: string | null; content?: string }>,
): CustomerServiceRuntimeInputBudget {
  const estimatedKnowledgeTokens = selectedKnowledge.reduce((sum, item) => {
    const explicit = Number(item.estimatedTokens);
    if (Number.isFinite(explicit) && explicit >= 0) return sum + explicit;
    return sum + 8 + estimateCustomerServiceRuntimeTextTokens(
      `${item.title || ''}\n${item.question || ''}\n${item.content || ''}`,
    );
  }, 0);
  const estimatedRuntimeInputTokens = plan.reservedInstructionTokens
    + plan.estimatedConversationTokens
    + plan.estimatedIdentityTokens
    + estimatedKnowledgeTokens;
  return {
    ...plan,
    estimatedKnowledgeTokens,
    estimatedRuntimeInputTokens,
    budgetExceeded: estimatedRuntimeInputTokens > plan.totalTokenBudget,
  };
}

function estimateConversationTokens(input: {
  latestMessage: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  conversationState?: CustomerServiceConversationStateSummary | null;
  activeContextWindow?: Record<string, unknown> | null;
}) {
  const active = input.activeContextWindow || null;
  if (active?.budgetApplied === true) {
    const estimated = Number(active.estimatedTokens);
    if (Number.isFinite(estimated) && estimated >= 0) return Math.trunc(estimated);
  }
  const historyTokens = (input.conversationHistory || []).reduce(
    (sum, item) => sum + 6 + estimateCustomerServiceRuntimeTextTokens(item.content),
    0,
  );
  return estimateCustomerServiceRuntimeTextTokens(input.latestMessage)
    + historyTokens
    + estimateCustomerServiceRuntimeTextTokens(safeJson(input.conversationState || null));
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function readBoundedEnvInt(key: string, fallback: number, min: number, max: number) {
  const parsed = Math.trunc(Number(process.env[key]));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
