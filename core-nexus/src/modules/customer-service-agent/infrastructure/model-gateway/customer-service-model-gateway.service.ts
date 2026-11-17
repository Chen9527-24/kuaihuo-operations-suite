import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepSeekChatMessage, DeepSeekService, DeepSeekThinkingMode } from '../../../ai/deepseek.service';

export type CustomerServiceModelStatus =
  | 'SUCCESS'
  | 'EMPTY_CONTENT'
  | 'TRUNCATED'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'MODEL_NOT_CONFIGURED'
  | 'MODEL_ERROR';

export type CustomerServiceEmptyContentReason =
  | 'NULL_OR_MISSING_CONTENT'
  | 'BLANK_CONTENT'
  | 'ONLY_REASONING_CONTENT'
  | 'TOKEN_BUDGET_EXHAUSTED'
  | 'INVALID_RESPONSE'
  | null;

export type CustomerServiceModelResult = {
  ok: boolean;
  status: CustomerServiceModelStatus;
  content: string;
  requestedModel: string;
  actualModel: string;
  model: string;
  elapsedMs: number;
  requestId: string;
  usage: Record<string, number>;
  errorMessage: string | null;
  finishReason: string | null;
  thinkingMode: DeepSeekThinkingMode;
  requestedMaxTokens: number;
  effectiveMaxTokens: number;
  timeoutMs: number;
  reasoningContentLength: number;
  visibleContentLength: number;
  emptyContentReason: CustomerServiceEmptyContentReason;
  truncated: boolean;
  timedOut: boolean;
};

@Injectable()
export class CustomerServiceModelGateway {
  constructor(
    private readonly deepSeekService: DeepSeekService,
    private readonly configService: ConfigService,
  ) {}

  isConfigured() {
    return Boolean(String(this.configService.get<string>('DEEPSEEK_API_KEY') || process.env.DEEPSEEK_API_KEY || '').trim());
  }

  async generate(input: {
    messages: DeepSeekChatMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    timeoutMs?: number;
    thinkingMode?: DeepSeekThinkingMode;
  }): Promise<CustomerServiceModelResult> {
    const requestedModel = this.resolveRequestedModel(input.model);
    const requestedMaxTokens = normalizePositiveInteger(input.maxTokens, 700);
    const effectiveMaxTokens = clampInteger(requestedMaxTokens, 1, 4000);
    const timeoutMs = normalizePositiveInteger(input.timeoutMs, this.resolveDefaultTimeoutMs());
    const thinkingMode = input.thinkingMode ?? 'ENABLED';
    if (!this.isConfigured()) {
      return failedResult({
        status: 'MODEL_NOT_CONFIGURED',
        requestedModel,
        requestedMaxTokens,
        effectiveMaxTokens,
        timeoutMs,
        thinkingMode,
        errorMessage: '后端未配置 DEEPSEEK_API_KEY，本次保留编译结果但不执行模型生成。',
      });
    }
    const startedAt = Date.now();
    try {
      const result = await this.deepSeekService.chat({
        messages: input.messages,
        model: input.model,
        temperature: input.temperature ?? 0.45,
        maxTokens: requestedMaxTokens,
        jsonMode: input.jsonMode === true,
        timeoutMs,
        thinkingMode,
      });
      const content = result.content.trim();
      const reasoningContentLength = result.reasoningContent.trim().length;
      const visibleContentLength = content.length;
      const finishReason = result.finishReason || null;
      const completionTokens = Number(result.usage.completionTokens || 0);
      const budgetExhausted = completionTokens >= result.effectiveMaxTokens;
      const truncated = String(finishReason || '').toLowerCase() === 'length';
      const emptyContentReason: CustomerServiceEmptyContentReason = content
        ? null
        : !result.responseValid
          ? 'INVALID_RESPONSE'
          : reasoningContentLength > 0
            ? 'ONLY_REASONING_CONTENT'
            : truncated || budgetExhausted
              ? 'TOKEN_BUDGET_EXHAUSTED'
              : result.content.length > 0
                ? 'BLANK_CONTENT'
                : 'NULL_OR_MISSING_CONTENT';
      const status: CustomerServiceModelStatus = content
        ? 'SUCCESS'
        : !result.responseValid
          ? 'INVALID_RESPONSE'
          : truncated || budgetExhausted
            ? 'TRUNCATED'
            : 'EMPTY_CONTENT';
      return {
        ok: Boolean(content),
        status,
        content,
        requestedModel: result.requestedModel || requestedModel,
        actualModel: result.model || '',
        model: result.model || '',
        elapsedMs: result.elapsedMs,
        requestId: result.requestId,
        usage: { ...result.usage },
        errorMessage: content ? null : emptyContentMessage(status, emptyContentReason),
        finishReason,
        thinkingMode: result.thinkingMode,
        requestedMaxTokens: result.requestedMaxTokens,
        effectiveMaxTokens: result.effectiveMaxTokens,
        timeoutMs: result.timeoutMs,
        reasoningContentLength,
        visibleContentLength,
        emptyContentReason,
        truncated,
        timedOut: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '模型调用失败';
      const timedOut = /超时|abort|timeout/i.test(errorMessage);
      return failedResult({
        status: timedOut ? 'TIMEOUT' : 'MODEL_ERROR',
        requestedModel,
        requestedMaxTokens,
        effectiveMaxTokens,
        timeoutMs,
        thinkingMode,
        elapsedMs: Math.max(0, Date.now() - startedAt),
        timedOut,
        errorMessage,
      });
    }
  }

  private resolveRequestedModel(input?: string) {
    return String(
      input
      || this.configService.get<string>('DEEPSEEK_MODEL')
      || this.configService.get<string>('DEEPSEEK_CHAT_MODEL')
      || process.env.DEEPSEEK_MODEL
      || process.env.DEEPSEEK_CHAT_MODEL
      || 'deepseek-v4-flash',
    ).trim();
  }

  private resolveDefaultTimeoutMs() {
    return normalizePositiveInteger(
      this.configService.get<string>('DEEPSEEK_TIMEOUT_MS') || process.env.DEEPSEEK_TIMEOUT_MS,
      600_000,
    );
  }
}

function failedResult(input: {
  status: Exclude<CustomerServiceModelStatus, 'SUCCESS' | 'EMPTY_CONTENT' | 'TRUNCATED' | 'INVALID_RESPONSE'>;
  requestedModel: string;
  requestedMaxTokens: number;
  effectiveMaxTokens: number;
  timeoutMs: number;
  thinkingMode: DeepSeekThinkingMode;
  elapsedMs?: number;
  timedOut?: boolean;
  errorMessage: string;
}): CustomerServiceModelResult {
  return {
    ok: false,
    status: input.status,
    content: '',
    requestedModel: input.requestedModel,
    actualModel: '',
    model: '',
    elapsedMs: input.elapsedMs ?? 0,
    requestId: '',
    usage: {},
    errorMessage: input.errorMessage,
    finishReason: null,
    thinkingMode: input.thinkingMode,
    requestedMaxTokens: input.requestedMaxTokens,
    effectiveMaxTokens: input.effectiveMaxTokens,
    timeoutMs: input.timeoutMs,
    reasoningContentLength: 0,
    visibleContentLength: 0,
    emptyContentReason: null,
    truncated: false,
    timedOut: input.timedOut === true,
  };
}

function emptyContentMessage(status: CustomerServiceModelStatus, reason: CustomerServiceEmptyContentReason) {
  if (status === 'INVALID_RESPONSE') return '模型响应结构不完整，未找到可解析的首个回复选项。';
  if (status === 'TRUNCATED') return '模型达到输出预算或长度限制，但未生成客户可见正文。';
  if (reason === 'ONLY_REASONING_CONTENT') return '模型仅返回推理内容，未返回客户可见正文。';
  return '模型未返回有效客户可见正文。';
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
