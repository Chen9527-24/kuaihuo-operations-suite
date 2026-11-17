import type { CustomerServiceHumanTurnRealizationV1 } from './customer-service-human-turn-realization';
import { findCustomerServiceAnswerSolicitationSurface } from '../interaction/customer-service-answer-solicitation-surface';

export type CustomerServiceHumanTurnSurfaceIssue = {
  key:
    | 'SURFACE_BUDGET_EXCEEDED'
    | 'IDENTITY_SURFACE_STACKED'
    | 'OPTIONAL_QUESTION_MENU_OVERFLOW'
    | 'ROLE_TURN_OPTIONAL_QUESTION_OVERRUN'
    | 'POST_QUESTION_META_TAIL'
    | 'PURE_GREETING_PRESENCE_FORMULA'
    | 'GENERIC_CHAT_SERVICE_ENTRY';
  message: string;
  evidence: string[];
};

export type CustomerServiceHumanTurnSurfaceComplianceReport = {
  status: 'PASS' | 'WARN';
  score: number;
  issueKeys: CustomerServiceHumanTurnSurfaceIssue['key'][];
  issues: CustomerServiceHumanTurnSurfaceIssue[];
};

/**
 * R5-B-H1 read-only surface diagnostics.
 * This does not decide business behavior, facts, Role, question authority, selection,
 * rewrite, retry, Final Candidate or Delivery. It only reports how the already-generated
 * draft compares with the compiled HumanTurn surface contract. Open-language heuristics
 * in this module are observability only and can never become Send Authority.
 */
export function evaluateCustomerServiceHumanTurnSurface(input: {
  text: string;
  realization: CustomerServiceHumanTurnRealizationV1;
  fullPublicIdentity: {
    businessLabel: string | null;
    relationLabel: string | null;
    preferredSurfaceLabel: string | null;
    allowedSurfaceLabels: string[];
  };
}): CustomerServiceHumanTurnSurfaceComplianceReport {
  const text = String(input.text || '').trim();
  const issues: CustomerServiceHumanTurnSurfaceIssue[] = [];
  const budget = input.realization.surfaceBudget;
  const visibleLength = [...text.replace(/\s+/g, '')].length;

  if (text && visibleLength > budget.softMaxChars) {
    issues.push({
      key: 'SURFACE_BUDGET_EXCEEDED',
      message: `当前 Role/turn shape 的自然软上限约 ${budget.softMaxChars} 字；保留真正有用的一层信息，不要为了完整继续解释。`,
      evidence: [`visibleLength=${visibleLength}`, `softMaxChars=${budget.softMaxChars}`],
    });
  }

  if (input.realization.identitySurface.mode === 'RELATION_ONLY') {
    const preferred = normalize(input.realization.identitySurface.preferredSurface);
    const extraSurfaces = [
      input.fullPublicIdentity.businessLabel,
      input.fullPublicIdentity.preferredSurfaceLabel,
      ...input.fullPublicIdentity.allowedSurfaceLabels,
    ]
      .map(normalize)
      .filter((value): value is string => Boolean(value && value !== preferred && value.length >= 2));
    const leaked = [...new Set(extraSurfaces)].filter((value) => normalize(text)?.includes(value));
    if (leaked.length) {
      issues.push({
        key: 'IDENTITY_SURFACE_STACKED',
        message: '本轮只是确认公开关系，只保留 relation-only 最小身份表面，不要再拼接平台、店铺、账号或其他身份 descriptor。',
        evidence: leaked.slice(0, 3),
      });
    }
  }

  if (budget.maxPresentedOptions === 2 && input.realization.turnShape.questionPlacement !== 'NONE') {
    const question = extractQuestionSegment(text);
    if (question) {
      const menuSeparators = (question.match(/、/g) || []).length
        + (question.match(/(?:还是|或是|或者)/g) || []).length;
      if (menuSeparators >= 2) {
        issues.push({
          key: 'OPTIONAL_QUESTION_MENU_OVERFLOW',
          message: '可选问题不要做三项及以上菜单式导航；用开放问法或最多一个自然二选一对比来减少不确定性。',
          evidence: [question.slice(0, 120)],
        });
      }
    }
  }

  const heldTurnAnswerSolicitation = input.realization.participation.questionDisposition === 'HOLD_THIS_TURN'
    ? findCustomerServiceAnswerSolicitationSurface(text)
    : '';
  if (heldTurnAnswerSolicitation) {
    issues.push({
      key: 'ROLE_TURN_OPTIONAL_QUESTION_OVERRUN',
      message: '当前 Role 与对话状态已经决定本轮先承接或给方向后停住；删除新的可选追问或变相索取回答（即使没有问号），先让客户上一轮提供的信息真正生效。',
      evidence: [
        `turnManeuver=${input.realization.participation.turnManeuver}`,
        heldTurnAnswerSolicitation.slice(0, 120),
      ],
    });
  }

  if (budget.stopAfterQuestion) {
    const questionEnd = Math.max(text.lastIndexOf('？'), text.lastIndexOf('?'));
    if (questionEnd >= 0) {
      const tail = text.slice(questionEnd + 1).replace(/[\s。.!！~～]/g, '');
      if (tail.length >= 3) {
        issues.push({
          key: 'POST_QUESTION_META_TAIL',
          message: '问题已经完成本轮互动，直接停；不要再解释提问目的、下一步策略或补一个总结收尾。',
          evidence: [text.slice(questionEnd + 1).trim().slice(0, 120)],
        });
      }
    }
  }

  if (input.realization.opening.avoidPresenceFormula && /(?:我在(?:呢|的)?|在呢|在的|在线(?:呢|的)?)/.test(text)) {
    issues.push({
      key: 'PURE_GREETING_PRESENCE_FORMULA',
      message: '客户只是问候，不需要额外证明在线/在场；自然对等回应即可。',
      evidence: [text.slice(0, 80)],
    });
  }

  if (input.realization.opening.serviceEntryMode === 'SERVICE_NEED'
    && input.realization.opening.avoidGenericChatInvitation
    && hasGenericChatInvitation(text)) {
    issues.push({
      key: 'GENERIC_CHAT_SERVICE_ENTRY',
      message: '当前 Canonical Plan 授权的是 Role 的服务/协助入口，不是泛闲聊入口；不要问“想聊什么/有什么想聊的”，应围绕当前可承接的了解、选择或处理事项自然开放服务入口。',
      evidence: [
        `serviceEntryMode=${input.realization.opening.serviceEntryMode}`,
        `target=${input.realization.opening.serviceEntryTarget || 'NONE'}`,
        text.slice(0, 120),
      ],
    });
  }



  const score = Math.max(0, 100 - issues.length * 24);
  return {
    status: issues.length ? 'WARN' : 'PASS',
    score,
    issueKeys: issues.map((item) => item.key),
    issues,
  };
}

function extractQuestionSegment(text: string) {
  const match = text.match(/(?:^|[。.!！\n])([^。.!！\n]*[？?])/g);
  const segment = (match ? match[match.length - 1] : undefined) || (/[？?]/.test(text) ? text : '');
  return segment.trim();
}

function normalize(value: string | null | undefined) {
  const text = String(value || '').replace(/[\s·•・—_-]+/g, '').trim();
  return text || null;
}

function hasGenericChatInvitation(text: string) {
  const compact = String(text || '').replace(/\s+/g, '');
  return /(?:想聊(?:什么|点什么|的)?|有什么想聊的|聊点什么|随便聊聊|陪你聊|可以聊聊|要不要聊聊)/u.test(compact);
}
