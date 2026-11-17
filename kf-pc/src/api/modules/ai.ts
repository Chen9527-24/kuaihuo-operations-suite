import { request } from '@/api/core/http';
import { isRecord, pickNumber, pickString, unwrapData } from '@/utils/apiData';

export interface DeepSeekChatTestPayload {
  systemPrompt?: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface DeepSeekChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
}

export interface DeepSeekChatTestResult {
  ok: boolean;
  model: string;
  content: string;
  reasoningContent: string;
  finishReason: string;
  usage: DeepSeekChatUsage;
  requestId: string;
  elapsedMs: number;
}

export async function testDeepSeekChat(payload: DeepSeekChatTestPayload): Promise<DeepSeekChatTestResult> {
  const response = await request<unknown>({
    path: '/ai/deepseek-chat/test',
    method: 'POST',
    body: payload,
    skipGlobalLoading: true
  });
  return normalizeDeepSeekChatTestResult(response);
}

function normalizeDeepSeekChatTestResult(payload: unknown): DeepSeekChatTestResult {
  const source = unwrapData(payload);
  const record = isRecord(source) ? source : {};
  const usage = isRecord(record.usage) ? record.usage : {};
  return {
    ok: record.ok !== false,
    model: pickString(record, ['model']),
    content: pickString(record, ['content']),
    reasoningContent: pickString(record, ['reasoningContent', 'reasoning_content']),
    finishReason: pickString(record, ['finishReason', 'finish_reason']),
    requestId: pickString(record, ['requestId', 'id']),
    elapsedMs: pickNumber(record, ['elapsedMs', 'elapsed_ms']),
    usage: {
      promptTokens: pickNumber(usage, ['promptTokens', 'prompt_tokens']),
      completionTokens: pickNumber(usage, ['completionTokens', 'completion_tokens']),
      totalTokens: pickNumber(usage, ['totalTokens', 'total_tokens']),
      promptCacheHitTokens: pickNumber(usage, ['promptCacheHitTokens', 'prompt_cache_hit_tokens']),
      promptCacheMissTokens: pickNumber(usage, ['promptCacheMissTokens', 'prompt_cache_miss_tokens'])
    }
  };
}
