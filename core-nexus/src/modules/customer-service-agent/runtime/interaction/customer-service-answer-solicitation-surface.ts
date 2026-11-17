/**
 * Finds a customer-answer solicitation in conversational Chinese, including
 * punctuationless private-message questions and imperative requests. This is a
 * discourse-act surface check only; it carries no business or Plan authority.
 */
export function findCustomerServiceAnswerSolicitationSurface(value: string) {
  return findCustomerServiceAnswerSolicitationSpan(value)?.text || '';
}

export type CustomerServiceAnswerSolicitationSpan = {
  start: number;
  end: number;
  text: string;
};

export function findCustomerServiceAnswerSolicitationSpan(value: string): CustomerServiceAnswerSolicitationSpan | null {
  const text = String(value || '');
  if (!text.trim()) return null;

  const explicitQuestion = findExplicitQuestionSpan(text);
  if (explicitQuestion) return explicitQuestion;

  // Conversational models often omit a question mark while still asking the
  // customer to choose or disclose an answer. Keep these discourse surfaces
  // observable so a HOLD turn cannot pass merely because punctuation changed.
  const requestedChoice = findPatternSpan(text, /(?:请|麻烦)?(?:你|您)?(?:先)?(?:告诉我|跟我说(?:一下|下|说)?|说(?:一下|下|说)|说说|选一下).{0,32}(?:还是|或者).{1,24}(?:[。！？!?]|$)/u);
  if (requestedChoice) return requestedChoice;

  const exampleQuestionContinuation = findPatternSpan(text, /(?:比如|例如|譬如)(?:你|您)?[^。！？!?\n]{0,16}(?:能不能|可不可以|是否|有没有|要不要)[^。！？!?\n]*(?:[。！？!?]|$)/u);
  if (exampleQuestionContinuation) return exampleQuestionContinuation;

  const implicitChoiceQuestion = findImplicitChoiceQuestionSpan(text);
  if (implicitChoiceQuestion) return implicitChoiceQuestion;

  const requestBeforeTarget = findPatternSpan(text, /(?:请|麻烦)?(?:你|您)?(?:先)?(?:告诉我|跟我说(?:一下|下|说)?|说(?:一下|下|说)|发我|给我|提供|补充|确认一下|选一下|讲一下).{0,24}(?:什么|哪(?:个|些|种|类|方面|一块|一步|一环|件|件事|里|儿)?|怎么|如何|是否|有没有|几(?:个|种|步)?|多少|偏好|想法|要求|需求|情况|选择|倾向)/u);
  if (requestBeforeTarget) return expandToSolicitationClause(text, requestBeforeTarget);

  const directedDisclosure = findPatternSpan(text, /(?:请|麻烦)?(?:你|您)(?:先)?把[^。！？!?]{1,28}(?:说|讲|发|给|补充|确认)(?:一下|下|出来|清楚|给我|过来)?/u);
  if (directedDisclosure) return directedDisclosure;

  const targetBeforeRequest = findPatternSpan(text, /(?:什么|哪(?:个|些|种|类|方面|一块|一步|一环|件|件事|里|儿)?|怎么|如何|是否|有没有|多少)[^。！？!?]{0,18}(?:直接)?(?:告诉我|跟我说|说(?:一下|下|说)?|发我|给我|提供|补充|确认一下)/u);
  if (targetBeforeRequest) return expandToSolicitationClause(text, targetBeforeRequest);

  if (!/(?:不管|无论)/u.test(text)) {
    const implicitQuestion = findPatternSpan(text, /(?:你|您).{0,18}(?:什么|哪(?:个|些|种|类|方面|一块|一步|一环|件|件事|里|儿)?|怎么|如何|是否|有没有|多少)(?:[，,].{0,24})?[。！!~～\s]*$/u);
    if (implicitQuestion) return implicitQuestion;
  }
  return null;
}

function findExplicitQuestionSpan(text: string): CustomerServiceAnswerSolicitationSpan | null {
  const questionEnd = text.search(/[？?]/u);
  if (questionEnd < 0) return null;
  let start = Math.max(
    text.lastIndexOf('。', questionEnd - 1),
    text.lastIndexOf('！', questionEnd - 1),
    text.lastIndexOf('!', questionEnd - 1),
    text.lastIndexOf('\n', questionEnd - 1),
  ) + 1;
  const sentence = text.slice(start, questionEnd + 1);
  const softBoundary = Math.max(
    sentence.lastIndexOf('，'),
    sentence.lastIndexOf(','),
    sentence.lastIndexOf('：'),
    sentence.lastIndexOf(':'),
    sentence.lastIndexOf('；'),
    sentence.lastIndexOf(';'),
  );
  if (softBoundary >= 0) {
    const suffix = sentence.slice(softBoundary + 1).trimStart();
    const prefix = sentence.slice(0, softBoundary);
    const suffixStartsNewQuestion = /^(?:你|您|请|麻烦|更想|更偏|想先|先(?:看|选|处理|说)|要不要|是否|有没有|哪|什么|怎么|如何|能否|方便)/u.test(suffix);
    const prefixAlreadyOpensContrast = /(?:你|您).{0,18}(?:是|更偏|更想|喜欢|倾向)/u.test(prefix)
      && /^(?:还是|或者|或是)/u.test(suffix);
    if (suffixStartsNewQuestion && !prefixAlreadyOpensContrast) {
      const leadingWhitespace = sentence.slice(softBoundary + 1).match(/^\s*/u)?.[0].length || 0;
      start += softBoundary + 1 + leadingWhitespace;
    }
  }
  return trimSpan(text, start, extendThroughQuestionPurposeTail(text, questionEnd + 1));
}

function extendThroughQuestionPurposeTail(text: string, questionEnd: number) {
  const tail = text.slice(questionEnd);
  const continuation = tail.match(/^\s*(?:(?:我好|我再|这样|方便我|好让我|到时候我|也好(?:让我|方便|帮))[^。！？!?\n]{2,48}[。！？!?]?)/u);
  return continuation ? questionEnd + continuation[0].length : questionEnd;
}

function findPatternSpan(text: string, pattern: RegExp) {
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return null;
  return trimSpan(text, match.index, match.index + match[0].length);
}

function findImplicitChoiceQuestionSpan(text: string): CustomerServiceAnswerSolicitationSpan | null {
  const pattern = /(?:你|您)[^。！？!?\n]{0,36}(?:还是|或者)[^。！？!?\n]{1,24}(?:[。！？!?]|$)/gu;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    // "你可以选 A 或者 B" is guidance, not a request for an answer.
    const surface = match[0];
    if (/(?:可以|建议|不妨|适合|都能|都可以|任选|直接选)/u.test(surface)) continue;
    return trimSpan(text, match.index, match.index + surface.length);
  }
  return null;
}

function trimSpan(text: string, rawStart: number, rawEnd: number): CustomerServiceAnswerSolicitationSpan | null {
  let start = rawStart;
  let end = rawEnd;
  while (start < end && /\s/u.test(text[start])) start += 1;
  while (end > start && /\s/u.test(text[end - 1])) end -= 1;
  return start < end ? { start, end, text: text.slice(start, end) } : null;
}

function expandToSolicitationClause(text: string, span: CustomerServiceAnswerSolicitationSpan) {
  const sentenceStart = Math.max(
    text.lastIndexOf('。', span.start - 1),
    text.lastIndexOf('！', span.start - 1),
    text.lastIndexOf('!', span.start - 1),
    text.lastIndexOf('？', span.start - 1),
    text.lastIndexOf('?', span.start - 1),
    text.lastIndexOf('\n', span.start - 1),
  ) + 1;
  const clauseStart = Math.max(
    sentenceStart - 1,
    text.lastIndexOf('，', span.start - 1),
    text.lastIndexOf(',', span.start - 1),
    text.lastIndexOf('；', span.start - 1),
    text.lastIndexOf(';', span.start - 1),
  ) + 1;
  const dependentPrefix = text.slice(sentenceStart, clauseStart).trim().replace(/[，,；;]+$/u, '');
  const start = /^(?:或者|或是|也可以|要不|如果)[^。！？!?\n]{0,20}$/u.test(dependentPrefix)
    ? sentenceStart
    : clauseStart;
  const remaining = text.slice(span.end);
  const sentenceEndOffset = remaining.search(/[。！？!?\n]/u);
  const end = sentenceEndOffset >= 0 ? span.end + sentenceEndOffset + 1 : text.length;
  return trimSpan(text, start, end) || span;
}
