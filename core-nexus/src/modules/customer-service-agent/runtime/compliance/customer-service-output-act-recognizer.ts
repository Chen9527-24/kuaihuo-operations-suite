import { Injectable } from '@nestjs/common';
import type { CustomerServiceSelectedKnowledgeEntry } from '../../shared/context/customer-service-knowledge.util';
import type { CustomerServiceActType, CustomerServiceInteractionPlanV2 } from '../interaction/customer-service-interaction-plan.type';
import type { CustomerServiceHumanTurnRealizationV1 } from '../generation/customer-service-human-turn-realization';
import { getCustomerServiceActDescriptor, listCustomerServiceActDescriptors } from './customer-service-act-descriptor.registry';

export type CustomerServiceObservedActSpan = {
  start: number;
  end: number;
  text: string;
};

export type CustomerServiceObservedClaimScope = 'NONE' | 'GENERAL_GUIDANCE' | 'MERCHANT_SPECIFIC' | 'UNKNOWN';
export type CustomerServiceObservedClaimProvenance = 'NONE' | 'CUSTOMER_CONTEXT' | 'GENERAL_MODEL_KNOWLEDGE' | 'BUSINESS_GROUNDING' | 'UNKNOWN';

export type CustomerServiceObservedAct = {
  type: CustomerServiceActType;
  observation: 'OBSERVED' | 'NOT_OBSERVED' | 'UNCERTAIN';
  confidence: number;
  evidence: string[];
  groundingRefs: string[];
  spans: CustomerServiceObservedActSpan[];
  /** R4-A semantic authority trace; diagnostic only and never creates Plan authority. */
  claimScope: CustomerServiceObservedClaimScope;
  provenance: CustomerServiceObservedClaimProvenance;
};

type RecognitionInput = {
  text: string;
  plan: CustomerServiceInteractionPlanV2;
  latestCustomerMessage: string;
  knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[];
  publicIdentity?: string | null;
  publicIdentityAliases?: string[];
  merchantRoleName?: string | null;
  merchantBrandName?: string | null;
  /** PC-configured public scope; used only as evidence for an authorized scope Act. */
  serviceScope?: string | null;
  /** Server-owned realization projection. Model markers only define message boundaries; canonical Act binding comes from Plan. */
  humanTurnRealization?: CustomerServiceHumanTurnRealizationV1 | null;
  generatedSegments?: Array<{
    index?: number;
    purposes?: string[];
    content: string;
    plannedActRefs?: string[];
    plannedActTypes?: string[];
    allowedGroundingRefs?: string[];
    provenanceAuthority?: 'CANONICAL_SEGMENT_PLAN';
  }> | null;
};

@Injectable()
export class CustomerServiceOutputActRecognizer {
  recognize(input: RecognitionInput): CustomerServiceObservedAct[] {
    const text = String(input.text || '').trim();
    const relevant = new Set<CustomerServiceActType>([
      ...input.plan.acts.map((item) => item.type),
      ...input.plan.suppressedActs.map((item) => item.type),
      // V1.4 Full Unexpected Act Detection: every high-impact act must be scanned
      // even when the plan did not mention it, otherwise the model can silently
      // create a new identity/business/question act outside the canonical plan.
      ...listCustomerServiceActDescriptors()
        .filter((item) => item.authorization === 'EXPLICIT_ONLY')
        .map((item) => item.type),
    ]);
    return [...relevant].sort().map((type) => this.observe(type, input, text));
  }

  private observe(type: CustomerServiceActType, input: RecognitionInput, text: string): CustomerServiceObservedAct {
    const descriptor = getCustomerServiceActDescriptor(type);
    if (!text) return result(type, 'NOT_OBSERVED', 1, ['EMPTY_TEXT']);
    const customer = input.latestCustomerMessage;

    switch (type) {
      case 'PRESENCE_ACK': {
        const span = findPresenceAckSpan(text);
        return fromSpan(type, span, 0.94, 0.82, 'GREETING_OR_PRESENCE');
      }
      case 'CONFIRM_ROLE': {
        let span = findPatternSpan(text, /(?:是的|对|嗯|没错|我是|这边是|我这边是).{0,18}(?:客服|店员|顾问|售后|导购|商家服务)/i)
          || findPatternSpan(text, /(?:客服|店员|顾问|售后|导购).{0,10}(?:这边|这儿|在)/i);
        const identitySurfaces = uniqueStrings([input.publicIdentity, ...(input.publicIdentityAliases || [])]);
        if (!span && /(?:是的|对|嗯|没错|是呀|对呀)/i.test(text)) {
          for (const identity of identitySurfaces) {
            span = findLiteralSpan(text, identity);
            if (span) break;
          }
        }
        return fromSpan(type, span, 0.96, 0.88, 'ROLE_CONFIRMATION_PATTERN');
      }
      case 'DISCLOSE_AI_IDENTITY': {
        const span = findPositiveAiIdentitySpan(text);
        return fromSpan(type, span, 0.99, 0.95, 'AI_IDENTITY_POSITIVE_CLAIM');
      }
      case 'DISCLOSE_PUBLIC_IDENTITY': {
        const identities = uniqueStrings([input.publicIdentity, ...(input.publicIdentityAliases || [])]);
        let span: CustomerServiceObservedActSpan | null = null;
        for (const identity of identities) {
          const literalSpan = findLiteralSpan(text, identity);
          if (literalSpan && isExplicitPublicIdentityDisclosure(text, literalSpan, identity)) {
            span = literalSpan;
            break;
          }
        }
        span ||= findPatternSpan(text, /(?:店里|店铺|商家|这边).{0,10}(?:客服|顾问|售后|店员|导购)/i);
        return result(
          type,
          span ? 'OBSERVED' : descriptor.hardVerifiable ? 'NOT_OBSERVED' : 'UNCERTAIN',
          span ? 0.95 : 0.68,
          span ? ['PUBLIC_IDENTITY_MATCH'] : [],
          [],
          span ? [span] : [],
        );
      }
      case 'DISCLOSE_NAME': {
        const name = String(input.merchantRoleName || '').trim();
        const genericNameSpan = findPatternSpan(text, /(?:我叫|叫我|你可以叫我|可以叫我)[“"']?[\p{Script=Han}A-Za-z0-9_-]{1,12}/iu);
        if (!name || /客服|售后|顾问|导购|店员/.test(name)) {
          return result(type, genericNameSpan ? 'OBSERVED' : 'UNCERTAIN', genericNameSpan ? 0.82 : 0.4, genericNameSpan ? ['UNVERIFIED_SELF_NAME_DISCLOSURE'] : ['NO_RELIABLE_PUBLIC_NAME'], [], genericNameSpan ? [genericNameSpan] : []);
        }
        const span = findLiteralSpan(text, name);
        if (span) return result(type, 'OBSERVED', 0.98, [`NAME:${name}`], [], [span]);
        return result(type, genericNameSpan ? 'UNCERTAIN' : 'NOT_OBSERVED', genericNameSpan ? 0.55 : 0.9, genericNameSpan ? ['DIFFERENT_OR_UNVERIFIED_SELF_NAME'] : [], [], genericNameSpan ? [genericNameSpan] : []);
      }
      case 'DIRECT_ANSWER': {
        const bound = observePlanBoundOpenValueAct(type, input, text);
        if (bound) return bound;
        // Compatibility path for non-HVE callers that do not provide the current
        // server-owned realization contract. This structural check is not used as
        // the HVE3 semantic send authority.
        const span = findSubstantiveValueSpan(text);
        return fromSpan(type, span, 0.78, 0.7, 'COMPATIBILITY_SUBSTANTIVE_VALUE_SURFACE');
      }
      case 'REQUEST_REQUIRED_SLOT': {
        const span = findRequiredSlotSpan(text);
        return fromSpan(type, span, 0.96, 0.82, 'REQUIRED_SLOT_REQUEST');
      }
      case 'REQUEST_OPTIONAL_PREFERENCE': {
        const span = findQuestionSemanticSpan(text, input, 'OPTIONAL_PREFERENCE');
        return fromSpan(type, span, 0.92, 0.84, 'OPTIONAL_PREFERENCE_QUESTION');
      }
      case 'CLARIFY_AMBIGUITY': {
        const span = findQuestionSemanticSpan(text, input, 'AMBIGUITY_CLARIFICATION');
        return fromSpan(type, span, 0.94, 0.9, 'TRUE_AMBIGUITY_CLARIFICATION');
      }
      case 'EXPLAIN_SERVICE_SCOPE': {
        // Keep scope explanation distinct from a light service invitation. Generic
        // “有什么可以帮你的/想看的可以说” surfaces belong to OPEN_SERVICE_INVITATION
        // and must not become a second unexpected explicit Act.
        const span = findPatternSpan(text, /(?:可以|能)(?:帮你|给你)?(?:看|查|处理|核实|咨询)?[^。！？!?；;]{0,12}(?:款式|搭配|尺码|订单|物流|售后|退换|咨询)/i)
          || findPatternSpan(text, /(?:我|这边)(?:可以|能)?(?:帮你|给你)(?:看|处理|咨询)[^。！？!?；;]{0,12}(?:款式|搭配|尺码|订单|物流|售后|退换|咨询)/i)
          || (input.plan.acts.some((item) => item.type === 'EXPLAIN_SERVICE_SCOPE')
            ? findConfiguredServiceScopeSpan(text, input.serviceScope)
            : null);
        return fromSpan(type, span, 0.9, 0.82, 'SERVICE_SCOPE_PATTERN');
      }
      case 'OPEN_SERVICE_INVITATION': {
        const span = findQuestionSemanticSpan(text, input, 'OPEN_SERVICE_INVITATION')
          || findNonQuestionOpenServiceInvitationSpan(text);
        return fromSpan(type, span, 0.94, 0.86, 'OPEN_SERVICE_INVITATION_PATTERN');
      }
      case 'SALES_CTA': {
        const span = findPatternSpan(text, /(?:下单|拍下|购买|加购|领券|去看看|看看这款|现在买|直接买|点开(?:链接|页面|商品|图片|主页|按钮|购物车)|入手(?:这款|这个|它)|带走(?:这款|这个|它))/i);
        return fromSpan(type, span, 0.95, 0.9, 'SALES_CTA_PATTERN');
      }
      case 'BUSINESS_ADVANCE': {
        const span = findPatternSpan(text, /(?:下单|购买|加购|链接|推荐你|给你推荐|可以看看|看看这款|具体款|售后处理|帮你催|帮你查|进入下一步|下一步处理)/i);
        const generalGuidance = input.plan.acts.some((item) => item.type === 'PROVIDE_GENERAL_GUIDANCE')
          ? findGeneralGuidanceSpan(text, input.knowledgeEntries)
          : null;
        if (span && generalGuidance && spansOverlap(span, generalGuidance) && !isCustomerServiceMerchantSpecificClaim(generalGuidance.text)) {
          return result(
            type,
            'NOT_OBSERVED',
            0.94,
            ['GENERAL_GUIDANCE_IS_NOT_BUSINESS_ADVANCE'],
            [],
            [],
            'GENERAL_GUIDANCE',
            'GENERAL_MODEL_KNOWLEDGE',
          );
        }
        return fromSpan(type, span, 0.84, 0.74, 'BUSINESS_ADVANCE_PATTERN');
      }
      case 'PROVIDE_GENERAL_GUIDANCE': {
        const bound = observePlanBoundOpenValueAct(type, input, text);
        if (bound) {
          if (bound.observation !== 'OBSERVED') return bound;
          // Keep the legacy lexical detector only as non-authoritative diagnostic
          // corroboration. Natural wording must never lose send eligibility merely
          // because it does not match this finite surface vocabulary.
          const diagnostic = findGeneralGuidanceSpan(text, input.knowledgeEntries);
          return {
            ...bound,
            confidence: diagnostic ? Math.max(bound.confidence, 0.93) : bound.confidence,
            evidence: [...new Set([
              ...bound.evidence,
              diagnostic ? 'OPEN_ACT_LEXICAL_DIAGNOSTIC_CORROBORATED' : 'OPEN_ACT_LEXICAL_DIAGNOSTIC_UNCORROBORATED',
            ])],
            claimScope: 'GENERAL_GUIDANCE',
            provenance: 'GENERAL_MODEL_KNOWLEDGE',
          };
        }
        // Compatibility / unexpected-Act detection for callers without an HVE3
        // realization contract. It remains diagnostic/soft unless a hard boundary
        // descriptor explicitly says otherwise.
        const span = findGeneralGuidanceSpan(text, input.knowledgeEntries);
        return result(
          type,
          span ? 'OBSERVED' : 'NOT_OBSERVED',
          span ? 0.84 : 0.72,
          span ? ['COMPATIBILITY_GENERAL_GUIDANCE_LEXICAL_DIAGNOSTIC'] : [],
          [],
          span ? [span] : [],
          span ? 'GENERAL_GUIDANCE' : 'NONE',
          span ? 'GENERAL_MODEL_KNOWLEDGE' : 'NONE',
        );
      }
      case 'RECOMMEND_GROUNDED_ITEM': {
        const bound = observePlanBoundGroundedAct(type, input, text);
        if (bound) return bound;
        // Compatibility only for callers without canonical candidate provenance.
        // Knowledge relevance is evidence for an already-observed merchant-specific
        // recommendation; it must never create the Act by itself. Generic category
        // guidance may legitimately overlap a rich Knowledge V2 collection.
        const recommendation = findActionableRecommendationSignalSpan(text);
        const entityMatches = findKnowledgeEntityMatches(text, input.knowledgeEntries);
        const configuredMerchantItemSpan = findConfiguredMerchantItemReferenceSpan(text, input.merchantBrandName);
        const merchantSpan = findMerchantSpecificRecommendationSpan(text) || configuredMerchantItemSpan;
        if (recommendation && entityMatches.length) {
          const span = findKnowledgeSpan(text, input.knowledgeEntries, entityMatches) || recommendation;
          return result(type, 'OBSERVED', 0.97, ['EXPLICIT_KNOWLEDGE_ENTITY_RECOMMENDATION'], entityMatches, [span], 'MERCHANT_SPECIFIC', 'BUSINESS_GROUNDING');
        }
        if (merchantSpan) {
          const matches = findKnowledgeMatches(merchantSpan.text, input.knowledgeEntries);
          return result(
            type,
            'OBSERVED',
            matches.length ? 0.96 : 0.93,
            [matches.length ? 'MERCHANT_SPECIFIC_RECOMMENDATION_GROUNDED' : 'MERCHANT_SPECIFIC_RECOMMENDATION_WITHOUT_GROUNDING'],
            matches,
            [merchantSpan],
            'MERCHANT_SPECIFIC',
            matches.length ? 'BUSINESS_GROUNDING' : 'UNKNOWN',
          );
        }
        const genericAdvice = findGeneralGuidanceSpan(text, input.knowledgeEntries);
        if (genericAdvice) {
          return result(type, 'NOT_OBSERVED', 0.96, ['GENERAL_GUIDANCE_IS_NOT_GROUNDED_ITEM_RECOMMENDATION'], [], [], 'GENERAL_GUIDANCE', 'GENERAL_MODEL_KNOWLEDGE');
        }
        return result(type, recommendation ? 'UNCERTAIN' : 'NOT_OBSERVED', recommendation ? 0.5 : 0.9, recommendation ? ['AMBIGUOUS_RECOMMENDATION_SCOPE'] : [], [], recommendation ? [recommendation] : [], recommendation ? 'UNKNOWN' : 'NONE', recommendation ? 'UNKNOWN' : 'NONE');
      }
      case 'EXPLAIN_GROUNDED_FACT': {
        const bound = observePlanBoundGroundedAct(type, input, text);
        if (bound) return bound;
        // Compatibility only for callers without canonical candidate provenance.
        // First observe an actual merchant/entity fact claim, then attach business
        // grounding. A simple Knowledge hit (tag/category/FAQ overlap) cannot create
        // a grounded-fact Act.
        const entityMatches = findKnowledgeEntityMatches(text, input.knowledgeEntries);
        const entityFactSpan = entityMatches.length ? findGroundedFactAssertionSpan(text, input.knowledgeEntries, entityMatches) : null;
        const merchantFactSpan = findMerchantSpecificFactSpan(text, input.merchantBrandName);
        const span = entityFactSpan || merchantFactSpan;
        if (span) {
          const matches = findKnowledgeMatches(span.text, input.knowledgeEntries);
          return result(
            type,
            'OBSERVED',
            matches.length ? 0.96 : 0.9,
            [matches.length ? 'EXPLICIT_MERCHANT_FACT_WITH_GROUNDING' : 'EXPLICIT_MERCHANT_FACT_WITHOUT_GROUNDING'],
            matches,
            [span],
            'MERCHANT_SPECIFIC',
            matches.length ? 'BUSINESS_GROUNDING' : 'UNKNOWN',
          );
        }
        return result(type, 'NOT_OBSERVED', 0.9, ['NO_EXPLICIT_MERCHANT_FACT_CLAIM']);
      }
      case 'REPORT_STATUS': {
        // Static Business Knowledge is never runtime status evidence. Recognize only
        // an actual present/progress/status claim in the text; provenance remains
        // UNKNOWN here so a separate runtime/status authority must justify it.
        const statusSpan = findStatusReportSpan(text);
        if (!statusSpan) return result(type, 'NOT_OBSERVED', 0.98, ['NO_EXPLICIT_STATUS_ASSERTION']);
        const statusRefs = input.plan.acts
          .filter((item) => item.type === 'REPORT_STATUS')
          .flatMap((item) => item.grounding || [])
          .filter((item) => item.status === 'SATISFIED')
          .flatMap((item) => item.evidenceRefs || []);
        return result(
          type,
          'OBSERVED',
          0.98,
          [statusRefs.length ? 'EXPLICIT_RUNTIME_STATUS_WITH_EVIDENCE' : 'EXPLICIT_RUNTIME_STATUS_WITHOUT_EVIDENCE'],
          uniqueStrings(statusRefs),
          [statusSpan],
          'MERCHANT_SPECIFIC',
          statusRefs.length ? 'BUSINESS_GROUNDING' : 'UNKNOWN',
        );
      }
      case 'REQUEST_HANDOFF': {
        const span = findExplicitHandoffSpan(text);
        return fromSpan(type, span, 0.98, 0.94, 'EXPLICIT_HANDOFF_COMMITMENT');
      }
      case 'EXPLAIN_BOUNDARY': {
        const bound = observePlanBoundBoundaryAct(input, text);
        if (bound) return bound;
        // Compatibility/diagnostic path for non-HVE callers. This pattern no longer
        // owns Candidate hardness; Plan/semantic layers treat missing boundary surface
        // as a warning while Claim Authority still fail-closes unsupported facts.
        const span = findPatternSpan(text, /(?:目前|当前|暂时|现有资料|已知资料|我这边|这边).{0,18}(?:没有|未覆盖|无法|不能|不确定|不能确认|无法确认)|(?:先不|不会|不拿).{0,10}(?:猜|猜测|推测|乱说|下结论)|需要(?:资料|文档|信息|核实|确认)|以[^。！？!?]{0,16}为准/i);
        return fromSpan(type, span, 0.9, 0.74, 'BOUNDARY_PATTERN_DIAGNOSTIC');
      }
      case 'EXECUTE_SERVICE_STEP': {
        const authorized = input.plan.acts.some((item) => item.type === 'EXECUTE_SERVICE_STEP');
        // Unexpected execution is a hard Plan boundary. Scan only high-precision
        // assistant self-commitments here; generic advice, quoted examples and
        // hypotheticals remain outside this Act.
        const span = findExplicitServiceExecutionCommitmentSpan(text)
          || (authorized
            ? findPatternSpan(text, /(?:帮你|给你|这边).{0,12}(?:查|核实|催|处理|提交|登记|跟进)/i)
              || findPatternSpan(text, /(?:下一步|先).{0,14}(?:提供|确认|核实|查看|检查)/i)
            : null);
        return fromSpan(type, span, 0.9, 0.72, 'SERVICE_STEP_PATTERN');
      }
      case 'ACKNOWLEDGE_PREFERENCE': {
        const span = preferenceOverlapSpan(customer, text);
        return result(type, span ? 'OBSERVED' : 'UNCERTAIN', span ? 0.8 : 0.45, span ? ['CUSTOMER_PREFERENCE_OVERLAP'] : [], [], span ? [span] : []);
      }
      case 'ACKNOWLEDGE_PROBLEM':
      case 'EMOTIONAL_ACK': {
        // Reception observation must be function-level, not a stance-word detector.
        // A bare word such as “确实” inside an answer-owned factual judgment is not
        // enough. Require a visible customer/situation-directed emotion/problem span.
        const span = findPatternSpan(text, /(?:听起来|看得出来|这种情况|这一下|你(?:也|确实)?).{0,16}(?:挫败|难受|着急|辛苦|头疼|焦虑|烦|不容易|委屈)/i)
          || findPatternSpan(text, /(?:辛苦你了|让你久等了|确实让人.{0,8}(?:难受|着急|挫败|头疼|烦))/i);
        return result(type, span ? 'OBSERVED' : 'UNCERTAIN', span ? 0.86 : 0.42, span ? ['FUNCTIONAL_RECEPTION_SPAN'] : [], [], span ? [span] : []);
      }
      case 'LIGHT_ACK': {
        const span = findPatternSpan(text, /^(?:嗯|好|好的|明白|懂了|收到|了解|知道了)(?:[，,。.!！]?)/i);
        return result(type, span ? 'OBSERVED' : 'UNCERTAIN', span ? 0.9 : 0.4, span ? ['LIGHT_ACK_OPENING_SPAN'] : [], [], span ? [span] : []);
      }
      case 'REASSURE': {
        const span = findPatternSpan(text, /(?:别担心|不用担心|不用太担心|先不用慌|没关系|问题不大|可以放心)/i);
        return result(type, span ? 'OBSERVED' : 'UNCERTAIN', span ? 0.9 : 0.38, span ? ['EXPLICIT_REASSURANCE_SPAN'] : [], [], span ? [span] : []);
      }
      case 'RELATIONSHIP_MAINTENANCE': {
        const span = findPatternSpan(text, /(?:恭喜你|替你开心|很高兴(?:能|可以)?帮到你|祝你(?:入职|工作|生活|今天|今晚|接下来|一切)?[^。！？!?]{0,16}(?:顺利|开心|愉快|顺顺利利|顺顺当当))/i);
        return result(type, span ? 'OBSERVED' : 'UNCERTAIN', span ? 0.92 : 0.38, span ? ['RELATIONSHIP_MAINTENANCE_SPAN'] : [], [], span ? [span] : []);
      }
      case 'NATURAL_CLOSE': {
        const span = findPatternSpan(text, /(?:就先这样|先到这|有需要再|之后再说|晚安|休息吧|不打扰你)/i);
        return result(type, span ? 'OBSERVED' : 'UNCERTAIN', span ? 0.8 : 0.35, span ? ['NATURAL_CLOSE_PATTERN'] : [], [], span ? [span] : []);
      }
      case 'STOP':
        // STOP is validated structurally by PlanCompliance using observed spans.
        return result(type, 'UNCERTAIN', 0.45, ['STRUCTURAL_STOP_VALIDATED_BY_PLAN_COMPLIANCE']);
      default:
        return result(type, 'UNCERTAIN', 0.3, [`NO_DETERMINISTIC_RECOGNIZER:${descriptor.recognition}`]);
    }
  }
}

function findKnowledgeMatches(text: string, entries: CustomerServiceSelectedKnowledgeEntry[]) {
  const compactText = compact(text);
  const refs: string[] = [];
  for (const entry of entries) {
    // Grounding provenance must be claim-relevant. Broad tags may help retrieval,
    // but they are not evidence that a merchant/entity claim is true.
    const candidates = [entry.title, entry.question || '', entry.entityKey || '', ...(entry.aliases || [])]
      .map(compact)
      .filter((item) => item.length >= 2);
    if (candidates.some((item) => compactText.includes(item))) refs.push(entry.id);
  }
  return refs;
}


function findKnowledgeEntityMatches(text: string, entries: CustomerServiceSelectedKnowledgeEntry[]) {
  const compactText = compact(text);
  const refs: string[] = [];
  for (const entry of entries) {
    const candidates = uniqueStrings([
      ...(entry.entityKey ? [compact(entry.entityKey)] : []),
      ...(compact(entry.title).length >= 4 ? [compact(entry.title)] : []),
      ...(entry.aliases || []).map(compact).filter((item) => item.length >= 4),
    ]).filter((item) => item.length >= 2);
    if (candidates.some((item) => compactText.includes(item))) refs.push(entry.id);
  }
  return uniqueStrings(refs);
}

function findGroundedFactAssertionSpan(
  text: string,
  entries: CustomerServiceSelectedKnowledgeEntry[],
  refs: string[],
): CustomerServiceObservedActSpan | null {
  const refSet = new Set(refs);
  for (const clause of splitClauses(text)) {
    // A clause that says an entity fact still needs confirmation is a boundary,
    // not positive factual realization. This mirrors merchant-specific fact
    // handling below and prevents canonical boundaries from gaining Grounding
    // provenance merely because they mention a known entity plus “支持/版本/价格”.
    if (isCustomerServiceBoundaryLikeClause(clause.text)) continue;
    const entityMatched = entries.some((entry) => {
      if (!refSet.has(entry.id)) return false;
      const surfaces = uniqueStrings([
        ...(entry.entityKey ? [compact(entry.entityKey)] : []),
        ...(compact(entry.title).length >= 4 ? [compact(entry.title)] : []),
        ...(entry.aliases || []).map(compact).filter((item) => item.length >= 4),
      ]).filter((item) => item.length >= 2);
      const value = compact(clause.text);
      return surfaces.some((surface) => value.includes(surface));
    });
    if (!entityMatched) continue;
    if (/(?:是|为|有|包含|提供|支持|采用|使用|适用|具备|属于|规格|材质|成分|功能|模块|套餐|价格|售价|库存|现货|活动|优惠|文档|接口|版本|限制|上限|下限)/iu.test(clause.text)) return clause;
  }
  return null;
}

function findMerchantSpecificFactSpan(
  text: string,
  merchantBrandName?: string | null,
): CustomerServiceObservedActSpan | null {
  for (const clause of splitClauses(text)) {
    // A boundary/disclaimer about unknown merchant data is not itself a positive
    // merchant fact claim and must never be turned into a grounding failure.
    if (isCustomerServiceBoundaryLikeClause(clause.text)) continue;
    if (!isCustomerServiceMerchantSpecificClaim(clause.text, merchantBrandName)) continue;
    if (findRecommendationSignalSpan(clause.text)) continue;
    if (/(?:是|为|有|包含|提供|支持|采用|使用|适用|具备|属于|规格|材质|成分|功能|模块|套餐|价格|售价|库存|现货|活动|优惠|文档|接口|版本|限制|上限|下限|比较多|目前有|现在有)/iu.test(clause.text)) return clause;
  }
  return null;
}

function findStatusReportSpan(text: string): CustomerServiceObservedActSpan | null {
  const subject = /(?:订单|包裹|物流|快递|退款|退货|换货|工单|申请|任务|处理单|修复任务|接口调用|服务实例|系统故障|账号状态)/iu;
  const explicitState = /(?:已经?(?:完成|提交|发货|到达|签收|退款|恢复|修复|受理|处理)|正在(?:处理|修复|退款|审核|发货|同步|恢复)|处理中|待处理|等待中|尚未(?:完成|发货|退款|恢复|修复|处理)|还未(?:完成|发货|退款|恢复|修复|处理)|(?:当前)?状态(?:是|为)|(?:当前)?进度(?:是|为|到))/iu;
  for (const clause of splitClauses(text)) {
    // Questions, hypothetical guidance and noun phrases such as “现有系统” or
    // “目前最想解决哪块” are not runtime status assertions.
    if (isQuestionLikeClause(clause.text)) continue;
    if (!subject.test(clause.text) || !explicitState.test(clause.text)) continue;
    return clause;
  }
  return null;
}

function isExplicitPublicIdentityDisclosure(
  text: string,
  span: CustomerServiceObservedActSpan,
  identity: string,
) {
  const before = text.slice(Math.max(0, span.start - 16), span.start);
  const after = text.slice(span.end, Math.min(text.length, span.end + 12));
  if (/(?:我是|我这边是|这边是|这里是|我们是|来自|作为|由)[^。！？!?]{0,8}$/u.test(before)) return true;
  const identityContainsRole = /(?:客服|售后|顾问|导购|店员|技术支持|销售顾问|课程顾问)/u.test(identity);
  return identityContainsRole && /^(?:这边|这里|为你|为您|在|来)[^。！？!?]{0,8}/u.test(after);
}

function findKnowledgeSpan(text: string, entries: CustomerServiceSelectedKnowledgeEntry[], refs: string[]) {
  for (const entry of entries) {
    if (!refs.includes(entry.id)) continue;
    for (const value of [entry.title, entry.question || '', entry.entityKey || '', ...(entry.aliases || [])]) {
      const literal = String(value || '').trim();
      if (literal.length < 2) continue;
      const span = findLiteralSpan(text, literal);
      if (span) return span;
    }
  }
  return null;
}


function findPresenceAckSpan(text: string) {
  return findPatternSpan(text, /(?:你好|您好|嗨|哈[喽啰]|在呢|在的|我在|早上好|早安|上午好|中午好|下午好|晚上好)/iu)
    || findPatternSpan(text, /(?:^|[，,。！？!?；;\s])早(?:呀|啊|哇|哦)?(?=[，,。！？!?；;\s]|$)/iu);
}

type QuestionSemanticClass = 'OPEN_SERVICE_INVITATION' | 'OPTIONAL_PREFERENCE' | 'REQUIRED_SLOT' | 'AMBIGUITY_CLARIFICATION' | 'OTHER_QUESTION';

/**
 * V1.9 Generic Semantic Separation.
 *
 * This classifier is observation-only: it never authorizes behavior and never
 * changes the Canonical Plan. Its only job is to prevent one natural question
 * clause from being multiply interpreted as unrelated Explicit Acts.
 */
function findQuestionSemanticSpan(
  text: string,
  input: RecognitionInput,
  target: Exclude<QuestionSemanticClass, 'OTHER_QUESTION'>,
): CustomerServiceObservedActSpan | null {
  for (const clause of splitClauses(text)) {
    if (!isQuestionLikeClause(clause.text)) continue;
    if (classifyQuestionSemantic(clause.text, input) === target) return clause;
  }
  return null;
}

function findRequiredSlotSpan(text: string): CustomerServiceObservedActSpan | null {
  for (const clause of splitClauses(text)) {
    // Required-slot observation needs both a concrete task input and an actual
    // request for it. Merely offering an optional choice that mentions a domain
    // object must not become required data collection.
    if (isRequiredSlotQuestion(clause.text)) return clause;
  }
  return null;
}

function classifyQuestionSemantic(clauseValue: string, input: RecognitionInput): QuestionSemanticClass {
  const clause = String(clauseValue || '').trim();
  if (!clause || !isQuestionLikeClause(clause)) return 'OTHER_QUESTION';

  if (isRequiredSlotQuestion(clause)) return 'REQUIRED_SLOT';

  const opening = isOpenServiceInvitationQuestion(clause);
  const preference = isOptionalPreferenceQuestion(clause, input.plan);
  if (opening && preference) {
    const planned = new Set(input.plan.acts.map((item) => item.type));
    const openingPlanned = planned.has('OPEN_SERVICE_INVITATION');
    const preferencePlanned = planned.has('REQUEST_OPTIONAL_PREFERENCE');
    if (openingPlanned !== preferencePlanned) return openingPlanned ? 'OPEN_SERVICE_INVITATION' : 'OPTIONAL_PREFERENCE';
    if (isOpeningLikeCustomerMessage(input.latestCustomerMessage)) return 'OPEN_SERVICE_INVITATION';
    return 'OPTIONAL_PREFERENCE';
  }
  if (opening) return 'OPEN_SERVICE_INVITATION';
  if (preference) return 'OPTIONAL_PREFERENCE';
  if (isTrueAmbiguityClarificationQuestion(clause, input.latestCustomerMessage)) return 'AMBIGUITY_CLARIFICATION';
  return 'OTHER_QUESTION';
}

function isQuestionLikeClause(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/[?？]/u.test(text)) return true;
  // Chinese private-message questions often omit punctuation. Treat a terminal
  // interrogative particle or interrogative pronoun as question surface without
  // adding any business/Act authority; semantic classification still happens below.
  return /(?:吗|呢|嘛|么|没有|什么|啥|哪(?:个|些|种|类|方面|一块|一步)?|怎么|如何)[呀啊哦吧]*[。！!~～\s]*$/u.test(text);
}

function isRequiredSlotQuestion(text: string) {
  const value = String(text || '').trim();
  const concreteSlot = /(?:订单号|单号|手机号|手机尾号|地址|型号|图片|截图|凭证|尺码|身高|体重)/iu;
  const orderSelection = /(?:哪一单|具体订单)/iu;
  if (!concreteSlot.test(value) && !orderSelection.test(value)) return false;

  // REQUEST_REQUIRED_SLOT is a hard Plan boundary, so ordinary lexical overlap is
  // only evidence. Negated, quoted, hypothetical and meta-level discussion about
  // whether a slot may be needed must not manufacture a customer-data request.
  if (/(?:请)?(?:不要|别|无需|不用|不必|没必要|不需要)[^。！？!?；;]{0,20}(?:把|发|给|提供|告诉|补充|确认)?[^。！？!?；;]{0,10}(?:订单号|单号|手机号|手机尾号|地址|型号|图片|截图|凭证|尺码|身高|体重)/iu.test(value)) return false;
  if (/(?:是否|要不要|需不需要|是不是需要|有没有必要)[^。！？!?；;]{0,16}(?:把|发|给|提供|告诉|补充|确认)?[^。！？!?；;]{0,10}(?:订单号|单号|手机号|手机尾号|地址|型号|图片|截图|凭证|尺码|身高|体重)/iu.test(value)) return false;
  if (/(?:订单号|单号|手机号|手机尾号|地址|型号|图片|截图|凭证|尺码|身高|体重)[^。！？!?；;]{0,12}(?:不是必须|并非必须|非必需|不一定需要|未必需要)/iu.test(value)) return false;
  if (/^(?:如果|要是|若|假如|假设)[^。！？!?；;]{0,24}(?:需要|要)[^。！？!?；;]{0,12}(?:提供|发|给|告诉|补充|确认)?[^。！？!?；;]{0,8}(?:订单号|单号|手机号|手机尾号|地址|型号|图片|截图|凭证|尺码|身高|体重)[^。！？!?；;]{0,16}(?:再说|到时|届时|之后|以后)/iu.test(value)) return false;

  const directPatterns = [
    /(?:请|麻烦)(?:你|您)?(?:把)?[^。！？!?；;]{0,8}(?:订单号|单号|手机号|手机尾号|地址|型号|图片|截图|凭证|尺码|身高|体重|哪一单|具体订单)[^。！？!?；;]{0,10}(?:发|给|提供|告诉|补充|确认)?(?:我|这边)?(?:一下)?/iu,
    /(?:你|您)?(?:能不能|能否|方便)(?:把|发|给|提供|告诉|补充|确认)?[^。！？!?；;]{0,10}(?:订单号|单号|手机号|手机尾号|地址|型号|图片|截图|凭证|尺码|身高|体重|哪一单|具体订单)/iu,
    /(?:订单号|单号|手机号|手机尾号|地址|型号|图片|截图|凭证|尺码|身高|体重)[^。！？!?；;]{0,8}(?:发|给|提供|告诉|补充|确认)(?:我|这边)?(?:一下)?/iu,
    /(?:发|给|提供|告诉|补充|确认)(?:一下)?[^。！？!?；;]{0,8}(?:订单号|单号|手机号|手机尾号|地址|型号|图片|截图|凭证|尺码|身高|体重)/iu,
  ];
  for (const pattern of directPatterns) {
    const span = findPatternSpan(value, pattern);
    if (!span || isInsideQuotedExecutionRange(value, span.start, span.end)) continue;
    const before = value.slice(Math.max(0, span.start - 16), span.start);
    const around = value.slice(Math.max(0, span.start - 10), Math.min(value.length, span.end + 12));
    if (/(?:不要|别|无需|不用|不必|没必要|不需要)\s*$/iu.test(before)) continue;
    if (/(?:不是必须|并非必须|非必需|不一定需要|未必需要)/iu.test(around)) continue;
    return true;
  }

  if (!isQuestionLikeClause(value) || !concreteSlot.test(value)) return false;
  const questionPattern = /(?:订单号|单号|手机号|手机尾号|地址|型号|图片|截图|凭证|尺码|身高|体重).{0,10}(?:是多少|是什么|哪个|哪一个|有吗|方便提供吗|能提供吗|可以提供吗|呢|吗)/iu;
  const questionSpan = findPatternSpan(value, questionPattern);
  return Boolean(questionSpan && !isInsideQuotedExecutionRange(value, questionSpan.start, questionSpan.end));
}

function isOptionalPreferenceQuestion(text: string, plan: CustomerServiceInteractionPlanV2) {
  if (/(?:更(?:喜欢|偏|在意|看重|关注)|比较(?:喜欢|偏|在意|看重)|最在意|优先看重|平时|习惯|偏好|预算|场合|风格|喜欢哪|倾向哪|更想要|想要哪种)/iu.test(text)) return true;
  // Bare A-or-B questions are semantically preference questions only when the
  // current Canonical Plan already authorizes optional preference collection.
  // This is a classification tie-breaker, not behavior authority.
  return plan.acts.some((item) => item.type === 'REQUEST_OPTIONAL_PREFERENCE')
    && /[^。！？!?]{1,20}(?:还是|或者)[^。！？!?]{1,20}[?？]/u.test(text)
    && !/(?:你|您)?(?:说的|指的|意思是|是说|说的是|指的是)/u.test(text);
}

function isOpenServiceInvitationQuestion(text: string) {
  return /(?:有什么|有啥).{0,10}(?:需要|想问|想了解|想看|要问|要了解|要看|可以|能)(?:我|这边)?(?:帮忙|帮你|协助|处理|看看|了解)?(?:的)?(?:吗|呢|[?？])/iu.test(text)
    || /(?:今天|这会儿|现在|这次)?(?:想|要|打算|准备)(?:先)?(?:看|了解|问|找|挑|办|处理|咨询).{0,10}(?:什么|啥|点啥|哪类|哪方面|哪一种|哪个方向)(?:呢|吗|[?？])/iu.test(text)
    || /(?:需要|要不要)(?:我|这边)?(?:帮你|帮忙|协助)(?:看看|处理|理一下)?(?:什么|哪方面|哪一块)?(?:吗|呢|[?？])/iu.test(text)
    || /(?:从哪(?:儿|里)?开始|先从哪(?:儿|里)?开始)(?:看|了解|问|挑|弄|处理)?(?:呢|吗|[?？])/iu.test(text);
}

function isTrueAmbiguityClarificationQuestion(text: string, latestCustomerMessage: string) {
  if (/(?:你|您)?(?:说的|提到的|指的|意思是|是说|说的是|指的是).{0,24}(?:吗|呢|[?？])/iu.test(text)) return true;
  if (/(?:你|您)?(?:说的|指的|意思是)?.{0,12}(?:是|指的是).{0,16}(?:还是|或者).{1,24}[?？]/iu.test(text)) return true;
  if (/(?:具体|方便确认一下|我确认一下).{0,10}(?:是指|指的是|是哪一个|是哪种情况|哪一步|哪个环节|哪一部分|哪块|哪里|哪儿|什么情况).{0,16}[?？]/iu.test(text)) return true;
  if (/(?:哪一步|哪个环节|哪一部分|哪块|哪里|哪儿).{0,14}(?:卡住|卡|报错|出错|不对|失败|没反应|有问题)[^。！？!?]*[?？]/iu.test(text)) return true;
  if (/(?:卡住|卡|报错|出错|不对|失败|没反应|有问题).{0,14}(?:哪一步|哪个环节|哪一部分|哪块|哪里|哪儿)[^。！？!?]*[?？]/iu.test(text)) return true;

  // A very short/underspecified customer message can support an explicit referent
  // clarification, but a generic follow-up question still does not become ambiguity
  // merely because the customer was brief.
  const customer = compact(latestCustomerMessage);
  const customerLooksReferentiallyAmbiguous = customer.length > 0 && customer.length <= 12
    && /(?:这个|那个|这事|那事|这里|那里|不行|不对|有问题|出问题|怎么回事|弄不了|搞不定|没反应)/iu.test(latestCustomerMessage);
  return customerLooksReferentiallyAmbiguous
    && /(?:具体|哪个|哪一个|哪种情况|指什么|哪里|哪儿|哪一步|什么意思)[^。！？!?]*[?？]/iu.test(text);
}

function isOpeningLikeCustomerMessage(text: string) {
  const value = String(text || '').trim();
  return /^(?:你?好|您好|嗨|哈[喽啰]|hello|hi|早上好|早安|上午好|中午好|下午好|晚上好|在吗|在不在)[呀啊哦呢嘛~～！!。,.，\s]*$/iu.test(value);
}

function findNonQuestionOpenServiceInvitationSpan(text: string) {
  return findPatternSpan(text, /(?:有什么|有啥|如果有|要是有|后面有).{0,12}(?:需要|想问|想了解|想看|问题).{0,10}(?:随时|都可以|可以)(?:说|问|告诉我|找我|提)/i)
    || findPatternSpan(text, /(?:随时|都可以)(?:来)?(?:问我|找我|跟我说|说一声|告诉我)/i)
    || findPatternSpan(text, /(?:有什么需要帮忙的|有需要的话|需要帮忙的话).{0,8}(?:随时说|可以说|告诉我|找我)?/i)
    || findPatternSpan(text, /(?:想看的|想了解的|想问的).{0,10}(?:都可以说|可以说|都能说|跟我说)/i)
    || findPatternSpan(text, /(?:想看|想了解|想问|要找|要挑).{0,12}(?:跟我说|告诉我|可以说|都行)/i);
}

function findConfiguredServiceScopeSpan(text: string, serviceScope: string | null | undefined) {
  const visibleText = String(text || '').trim();
  const configuredScope = String(serviceScope || '').trim();
  if (!visibleText || !configuredScope) return null;
  const ignored = new Set(['服务', '帮助', '帮你', '处理', '协助', '可以', '主要', '这边', '相关', '支持']);
  const anchors = uniqueStrings(
    configuredScope
      .split(/[\s,，、;；/|与和及]+/u)
      .map((item) => compact(item))
      .filter((item) => item.length >= 2 && !ignored.has(item)),
  );
  const compactVisible = compact(visibleText);
  const directMatchCount = anchors.filter((item) => compactVisible.includes(item)).length;
  if (directMatchCount >= Math.min(2, Math.max(1, anchors.length))) {
    return { start: 0, end: visibleText.length, text: visibleText };
  }

  // Scope lists are often naturally reordered (for example “需求梳理” ->
  // “梳理需求”). Compare configured semantic anchors by generic Han bigrams so
  // recognition is grounded in the PC configuration instead of a fixed phrase list.
  const ignoredBigrams = new Set(['服务', '帮助', '处理', '协助', '可以', '主要', '这边', '相关', '支持', '帮你']);
  const configuredBigrams = collectHanBigrams(configuredScope).filter((item) => !ignoredBigrams.has(item));
  const visibleBigrams = new Set(collectHanBigrams(visibleText));
  const overlap = new Set(configuredBigrams.filter((item) => visibleBigrams.has(item)));
  return overlap.size >= 2 ? { start: 0, end: visibleText.length, text: visibleText } : null;
}

function collectHanBigrams(value: string) {
  const segments = String(value || '').normalize('NFKC').match(/[\p{Script=Han}]{2,}/gu) || [];
  const result: string[] = [];
  for (const segment of segments) {
    for (let index = 0; index < segment.length - 1; index += 1) result.push(segment.slice(index, index + 2));
  }
  return uniqueStrings(result);
}

function spansOverlap(left: CustomerServiceObservedActSpan, right: CustomerServiceObservedActSpan) {
  return left.start < right.end && right.start < left.end;
}

function preferenceOverlapSpan(customer: string, reply: string) {
  const source = compact(customer);
  const stop = new Set([
    '你好', '您好', 'hello', 'hi', '客服', '推荐', '有没有', '什么', '一下', '一点', '可以', '还是',
    '请问', '谢谢', '想买', '想看', '看看', '东西', '衣服', '商品', '这边', '那个', '这个',
  ]);
  for (let size = Math.min(6, source.length); size >= 2; size -= 1) {
    for (let index = 0; index <= source.length - size; index += 1) {
      const token = source.slice(index, index + size);
      if (stop.has(token) || !/[\p{Script=Han}A-Za-z0-9]/u.test(token)) continue;
      const span = findLiteralSpan(reply, token);
      if (span) return span;
    }
  }
  return null;
}


function observePlanBoundBoundaryAct(
  input: RecognitionInput,
  text: string,
): CustomerServiceObservedAct | null {
  const realization = input.humanTurnRealization?.turnComposition;
  if (!realization) return null;
  const planned = input.plan.acts.some((act) => act.type === 'EXPLAIN_BOUNDARY' && act.necessity !== 'OPTIONAL');
  if (!planned) return null;
  const expectedSegments = realization.segmentPlan.filter((segment) => {
    const projected = Array.isArray(segment.plannedActTypes) && segment.plannedActTypes.length
      ? segment.plannedActTypes.includes('EXPLAIN_BOUNDARY')
      : segment.purposes.includes('BOUNDARY');
    return projected;
  });
  if (!expectedSegments.length) return result('EXPLAIN_BOUNDARY', 'UNCERTAIN', 0.62, ['SERVER_PLAN_BOUNDARY_SEGMENT_PROJECTION_MISSING']);

  const actualSegments = (input.generatedSegments || [])
    .map((segment, index) => ({ index: Number.isInteger(segment.index) ? Number(segment.index) : index, content: String(segment.content || '').trim() }))
    .filter((segment) => segment.content);
  for (const expected of expectedSegments) {
    const actual = actualSegments.find((segment) => segment.index === expected.index) || actualSegments[expected.index];
    if (!actual) continue;
    const explicit = splitClauses(actual.content).find((clause) => isCustomerServiceBoundaryLikeClause(clause.text));
    if (!explicit) continue;
    const span = findLiteralSpan(text, explicit.text) || { start: 0, end: text.length, text: explicit.text };
    return result('EXPLAIN_BOUNDARY', 'OBSERVED', 0.94,
      ['SERVER_PLAN_BOUNDARY_REALIZATION_CORROBORATED'], [], [span]);
  }

  // Segment provenance proves where a boundary *may* be realized; it cannot prove
  // that customer-visible boundary content actually exists. Keep this diagnostic
  // uncertain rather than turning any substantive VALUE sentence into a fake
  // EXPLAIN_BOUNDARY observation. Claim Authority remains the fact hard boundary.
  return result('EXPLAIN_BOUNDARY', 'UNCERTAIN', 0.62, ['SERVER_PLAN_BOUNDARY_PROJECTION_WITHOUT_VISIBLE_BOUNDARY']);
}


function observePlanBoundGroundedAct(
  type: Extract<CustomerServiceActType, 'RECOMMEND_GROUNDED_ITEM' | 'EXPLAIN_GROUNDED_FACT'>,
  input: RecognitionInput,
  text: string,
): CustomerServiceObservedAct | null {
  const realization = input.humanTurnRealization?.turnComposition;
  if (!realization) return null;
  const planned = input.plan.acts.some((act) => act.type === type && act.necessity !== 'OPTIONAL');
  if (!planned) return null;

  const expectedSegments = realization.segmentPlan.filter((segment) => (
    Array.isArray(segment.plannedActTypes)
      && segment.plannedActTypes.includes(type)
  ));
  if (!expectedSegments.length) return null;

  const actualSegments = (input.generatedSegments || [])
    .map((segment, index) => ({
      index: Number.isInteger(segment.index) ? Number(segment.index) : index,
      content: String(segment.content || '').trim(),
      plannedActTypes: uniqueStrings(segment.plannedActTypes || []),
      allowedGroundingRefs: uniqueStrings(segment.allowedGroundingRefs || []),
      provenanceAuthority: segment.provenanceAuthority,
    }))
    .filter((segment) => segment.content);

  // HVE3 candidate provenance is authoritative only when it was bound from the
  // canonical segment plan onto this exact candidate. Do not reconstruct refs from
  // title/entity/alias wording in the generated sentence.
  for (const expected of expectedSegments) {
    const actual = actualSegments.find((segment) => segment.index === expected.index) || actualSegments[expected.index];
    if (!actual || actual.provenanceAuthority !== 'CANONICAL_SEGMENT_PLAN') continue;
    if (!actual.plannedActTypes.includes(type)) continue;
    const expectedRefs = new Set(uniqueStrings(expected.allowedGroundingRefs || []));
    const groundingRefs = actual.allowedGroundingRefs.filter((ref) => expectedRefs.has(ref));
    const explicitRecommendationSpan = type === 'RECOMMEND_GROUNDED_ITEM'
      ? findMerchantSpecificRecommendationSpan(actual.content)
        || findConfiguredMerchantItemReferenceSpan(actual.content, input.merchantBrandName)
      : null;
    // R2.2 observability convergence: once the exact customer-visible segment is
    // already bound by CANONICAL_SEGMENT_PLAN to RECOMMEND_GROUNDED_ITEM and to
    // specific allowed Grounding refs, a positive merchant/entity assertion from
    // those same refs is sufficient evidence that the grounded candidate was
    // realized. Requiring an additional lexical recommendation verb here creates a
    // diagnostics-only false negative and must never force Generation wording.
    const groundedEntityAssertionSpan = groundingRefs.length
      ? findGroundedFactAssertionSpan(actual.content, input.knowledgeEntries, groundingRefs)
      : null;
    const localSpan = type === 'RECOMMEND_GROUNDED_ITEM'
      ? explicitRecommendationSpan || groundedEntityAssertionSpan
      : findMerchantSpecificFactSpan(actual.content, input.merchantBrandName)
        || groundedEntityAssertionSpan;
    if (!localSpan) continue;
    const span = findLiteralSpan(text, localSpan.text) || { start: 0, end: text.length, text: localSpan.text };
    const groundedRecommendationWithoutLexicalSignal = type === 'RECOMMEND_GROUNDED_ITEM'
      && !explicitRecommendationSpan
      && Boolean(groundedEntityAssertionSpan);
    return result(
      type,
      'OBSERVED',
      groundingRefs.length ? 0.98 : 0.94,
      [
        groundingRefs.length ? 'CANONICAL_SEGMENT_GROUNDING_PROVENANCE' : 'CANONICAL_SEGMENT_GROUNDED_ACT_WITHOUT_PROVENANCE',
        ...(groundedRecommendationWithoutLexicalSignal ? ['CANONICAL_GROUNDED_CANDIDATE_REALIZED_WITHOUT_LEXICAL_RECOMMENDATION_SIGNAL'] : []),
      ],
      groundingRefs,
      [span],
      'MERCHANT_SPECIFIC',
      groundingRefs.length ? 'BUSINESS_GROUNDING' : 'UNKNOWN',
    );
  }

  // If the canonical segment exists but the model did not realize a merchant-specific
  // grounded claim, the Act is simply not observed. Missing REQUIRED realization is
  // handled by the existing Plan/Semantic contract; provenance itself creates no Act.
  if (actualSegments.some((segment) => segment.provenanceAuthority === 'CANONICAL_SEGMENT_PLAN')) {
    return result(type, 'NOT_OBSERVED', 0.96, ['CANONICAL_SEGMENT_GROUNDED_ACT_NOT_REALIZED']);
  }
  return null;
}

function observePlanBoundOpenValueAct(
  type: Extract<CustomerServiceActType, 'DIRECT_ANSWER' | 'PROVIDE_GENERAL_GUIDANCE'>,
  input: RecognitionInput,
  text: string,
): CustomerServiceObservedAct | null {
  const realization = input.humanTurnRealization?.turnComposition;
  if (!realization) return null;
  const planned = input.plan.acts.some((act) => act.type === type && act.necessity !== 'OPTIONAL');
  if (!planned) return null;

  // Prefer the server-owned Act projection introduced by Contract Coherence.
  // Older realization fixtures may not carry plannedActTypes, so purposes=VALUE
  // remains a compatibility fallback only.
  const expectedSegments = realization.segmentPlan.filter((segment) => {
    const projected = Array.isArray(segment.plannedActTypes) && segment.plannedActTypes.length
      ? segment.plannedActTypes.includes(type)
      : segment.purposes.includes('VALUE');
    return projected;
  });
  if (!expectedSegments.length) {
    return result(type, 'NOT_OBSERVED', 0.98, ['SERVER_PLAN_ACT_SEGMENT_PROJECTION_MISSING']);
  }

  const actualSegments = (input.generatedSegments || [])
    .map((segment, index) => ({ index: Number.isInteger(segment.index) ? Number(segment.index) : index, content: String(segment.content || '').trim() }))
    .filter((segment) => segment.content);
  for (const expected of expectedSegments) {
    const actual = actualSegments.find((segment) => segment.index === expected.index) || actualSegments[expected.index];
    if (!actual) continue;
    const valueSpan = findSubstantiveValueSpan(actual.content);
    if (!valueSpan) continue;
    const span = findLiteralSpan(text, valueSpan.text) || { start: 0, end: text.length, text: valueSpan.text };
    return result(
      type,
      'OBSERVED',
      0.88,
      ['SERVER_PLAN_ACT_REALIZATION_PROVENANCE'],
      [],
      [span],
      type === 'PROVIDE_GENERAL_GUIDANCE' ? 'GENERAL_GUIDANCE' : 'NONE',
      type === 'PROVIDE_GENERAL_GUIDANCE' ? 'GENERAL_MODEL_KNOWLEDGE' : 'NONE',
    );
  }

  // Normalization may drop/merge structured markers. Recompute from the current
  // customer-visible text; a trailing question never erases a preceding value span.
  const normalizedValue = findSubstantiveValueSpan(text);
  if (realization.segmentPlan.length === 1 && normalizedValue) {
    return result(
      type,
      'OBSERVED',
      0.84,
      ['SERVER_PLAN_ACT_NORMALIZED_SINGLE_REALIZATION'],
      [],
      [normalizedValue],
      type === 'PROVIDE_GENERAL_GUIDANCE' ? 'GENERAL_GUIDANCE' : 'NONE',
      type === 'PROVIDE_GENERAL_GUIDANCE' ? 'GENERAL_MODEL_KNOWLEDGE' : 'NONE',
    );
  }

  if (!actualSegments.length && normalizedValue) {
    return result(
      type,
      'UNCERTAIN',
      0.62,
      ['SERVER_PLAN_ACT_MULTI_SEGMENT_REALIZATION_UNSTRUCTURED'],
      [],
      [normalizedValue],
      type === 'PROVIDE_GENERAL_GUIDANCE' ? 'GENERAL_GUIDANCE' : 'NONE',
      type === 'PROVIDE_GENERAL_GUIDANCE' ? 'GENERAL_MODEL_KNOWLEDGE' : 'NONE',
    );
  }

  return result(type, 'NOT_OBSERVED', 0.96, ['SERVER_PLAN_ACT_VALUE_NOT_REALIZED']);
}

function findSubstantiveValueSpan(text: string): CustomerServiceObservedActSpan | null {
  for (const clause of splitClauses(text)) {
    if (isSubstantivePlannedValueSurface(clause.text)) return clause;
  }
  return null;
}

function isSubstantivePlannedValueSurface(value: string) {
  const text = String(value || '').trim();
  const compactText = text.replace(/[\s，。！？、,.!?；;：:“”"'（）()\[\]【】]/gu, '');
  if (compactText.length < 2) return false;
  if (/[?？]\s*$/u.test(text)) return false;
  // Domain words such as ‘系统/模型/生成’ are normal customer content in SaaS/technical roles.
  // Only explicit internal/runtime failure boilerplate is non-substantive here.
  if (/(?:没有拿到可靠|可发送结果|未形成满足业务边界|稍后再试|稍后回复|(?:系统|模型)(?:内部|调用|生成|处理)?[^。！？!?]{0,8}(?:失败|异常|不可用)|重试(?:失败|中|一下))/iu.test(text)) return false;
  if (/^(?:好的?|好呀|嗯+|明白|知道了|收到|可以|行|没问题|在的?|你好|您好|哈[喽啰]|辛苦了|理解|了解)[呀啊哦呢~～！。,.，]*$/iu.test(text)) return false;
  if (/^(?:我)?(?:明白|理解|了解|知道|懂|收到)(?:你|您)?(?:的)?(?:顾虑|想法|意思|需求|情况|感受|问题|偏好)?[呀啊哦呢~～！。,.，]*$/iu.test(text)) return false;
  if (/(?:有什么(?:需要|想要)?(?:帮忙|帮助)|需要的话随时|尽管说|想聊什么|有什么想聊的)[呀啊哦呢~～！。,.，]*$/iu.test(text)) return false;
  if (/^(?:我是|我这边是|这边是|这里是|我们是|作为).{0,24}(?:客服|顾问|售后|店员|导购|智能客服|AI客服)[呀啊哦呢~～！。,.，]*$/iu.test(text)) return false;
  return true;
}

function findGeneralGuidanceSpan(
  text: string,
  _knowledgeEntries: CustomerServiceSelectedKnowledgeEntry[],
): CustomerServiceObservedActSpan | null {
  for (const clause of splitClauses(text)) {
    // Knowledge overlap does not change the semantic Act. A generic category or
    // principle-level recommendation remains PROVIDE_GENERAL_GUIDANCE even when
    // a rich Knowledge V2 collection contains the same terms. Grounding is
    // attached only after a merchant/entity-specific Act has been observed.
    if (isCustomerServiceMerchantSpecificClaim(clause.text)) continue;
    if (/(?:一般(?:来说|情况下)?|通常(?:来说|情况下)?|大多数情况下|可以(?:先)?(?:从|往|考虑|选|看)|建议(?:你|您)?(?:先)?|(?:更)?推荐(?:你|您)?(?:先)?(?:从|往|考虑|选|看)|不妨|(?:优先|首选)(?:考虑|看|选)?|更适合|比较适合|更好搭|比较好搭|更稳妥|更方便|如果.{0,18}(?:可以|建议|优先)|要是.{0,18}(?:可以|建议|优先))/iu.test(clause.text)) {
      return clause;
    }
    // Generic semantic fallback for GENERAL_GUIDANCE. The plan already authorizes
    // this act; recognition must not depend on a small phrase dictionary. Accept a
    // substantive, non-question decision/help clause when it is neither a merchant
    // fact nor a pure acknowledgement/identity/process/failure notice. This remains
    // a verifier for an authorized Act, not a new behavior authority.
    if (isSubstantiveGeneralGuidanceClause(clause.text)) return clause;
  }
  return null;
}

function isSubstantiveGeneralGuidanceClause(value: string) {
  const text = String(value || '').trim();
  const compactText = text.replace(/[\s，。！？、,.!?；;：:“”"'（）()\[\]【】]/gu, '');
  if (compactText.length < 8) return false;
  if (/[?？]/u.test(text)) return false;
  if (/(?:我是|智能客服|AI客服|机器人客服|人工智能客服|不是真人|真人)/iu.test(text)) return false;
  if (/(?:没有拿到可靠|可发送结果|换个说法|稍后再试|稍后回复|(?:系统|模型)(?:内部|调用|生成|处理)?[^。！？!?]{0,8}(?:失败|异常|不可用)|重试(?:失败|中|一下))/iu.test(text)) return false;
  if (/^(?:好的?|好呀|嗯+|明白|知道了|收到|可以|行|没问题|在的?|你好|您好|哈[喽啰]|辛苦了|理解|了解)[呀啊哦呢~～！。,.，]*$/iu.test(text)) return false;
  if (/(?:有什么(?:需要|想要)?(?:帮忙|帮助)|需要的话随时|尽管说|想聊什么|有什么想聊的)/iu.test(text)) return false;
  if (/(?:请|麻烦|告诉我|说一下|说下|发我|给我|能不能|是否|哪一个|哪个|什么样|怎么选)[^。！？!?]{0,16}$/iu.test(text)) return false;
  // A canonical GENERAL_GUIDANCE observation needs an actual decision/action
  // operator, not a merely positive adjective. Keep these cross-domain semantics structural:
  // evaluative surfaces such as “比较实用/更合适” alone are judgments, while
  // sequencing, narrowing, comparison, criteria, or imperative action realizes guidance.
  const directiveStart = /(?:^|[，,；;]\s*)(?:先|再|优先|首选|尽量|避免|选择|选|用|换|把|将|控制|调整|降低|提高|减少|增加|保持|处理|对比|权衡|缩小|排除)/iu;
  const decisionStructure = /(?:重点(?:看|放在|关注|考虑)|关键(?:是|在于)|取决于|区别(?:是|在于)|按.{0,14}(?:选|选择|判断|处理|考虑)|从.{0,14}(?:入手|开始|看|选|选择|考虑)|(?:选择|考虑|确认|缩小|排除|对比|权衡).{0,18}(?:范围|方向|条件|需求|偏好|限制|成本|风险|方案|方式))/iu;
  return directiveStart.test(text) || decisionStructure.test(text);
}

function findConfiguredMerchantItemReferenceSpan(
  text: string,
  merchantBrandName: string | null | undefined,
): CustomerServiceObservedActSpan | null {
  const brand = String(merchantBrandName || '').trim();
  if (!brand) return null;
  for (const clause of splitClauses(text)) {
    // Epistemic/boundary language may mention a configured merchant item only to
    // explain why a concrete recommendation cannot yet be made. That must never
    // manufacture a RECOMMEND_GROUNDED_ITEM Act.
    if (isCustomerServiceBoundaryLikeClause(clause.text)) continue;
    const brandIndex = clause.text.indexOf(brand);
    if (brandIndex < 0) continue;
    const tail = clause.text.slice(brandIndex + brand.length, brandIndex + brand.length + 10);
    // Configured brand + a deictic item reference is explicit merchant-specific
    // content. It is a hard Grounding boundary and intentionally does not depend
    // on product-category vocabulary or the open-language recommendation detector.
    if (/^[^。！？!?]{0,4}(?:这|那|某)(?:个|款|件|套|项|种)?/u.test(tail)) return clause;
  }
  return null;
}

function findMerchantSpecificRecommendationSpan(text: string): CustomerServiceObservedActSpan | null {
  for (const clause of splitClauses(text)) {
    // Uncertainty/boundary clauses cannot create a grounded recommendation Act
    // merely because they contain recommendation vocabulary.
    if (isCustomerServiceBoundaryLikeClause(clause.text)) continue;
    const recommendation = findRecommendationSignalSpan(clause.text);
    if (!recommendation) continue;
    if (isCustomerServiceMerchantSpecificClaim(clause.text)) return clause;
    if (/(?:这款|这一款|这几款|该款|这个商品|这个套餐|这个服务).{0,18}(?:推荐|适合|可以|建议|优先|好搭|值得|入手)/iu.test(clause.text)) return clause;
    if (/(?:推荐|建议|可以(?:先)?看看|优先看看).{0,20}(?:链接|在售|库存|有货|现货|本店|店里|我们这边)/iu.test(clause.text)) return clause;
  }
  return null;
}

function findActionableRecommendationSignalSpan(text: string): CustomerServiceObservedActSpan | null {
  for (const clause of splitClauses(text)) {
    if (isCustomerServiceBoundaryLikeClause(clause.text)) continue;
    const local = findRecommendationSignalSpan(clause.text);
    if (local) return clause;
  }
  return null;
}

function findRecommendationSignalSpan(text: string): CustomerServiceObservedActSpan | null {
  return findPatternSpan(text, /(?:推荐|建议(?:选|看|考虑|优先)?|可以(?:先)?(?:看看|看|选|考虑)|优先(?:看|选|考虑)|比较适合|更适合|不容易出错|比较好搭|更好搭|更省心|不挑场合)/iu);
}

export function isCustomerServiceMerchantSpecificClaim(text: string, merchantBrandName?: string | null) {
  const value = String(text || '').trim();
  if (!value) return false;
  const brand = String(merchantBrandName || '').trim();
  if (brand && value.includes(brand)) return true;

  // Merchant specificity must be anchored to an actual merchant-owned object,
  // merchant location/store deictic, or a concrete merchant capability surface.
  // A bare first-person discourse subject used for conversational reasoning is not
  // ownership evidence and must never manufacture a business Claim.
  // Colloquial merchant capability assertions may omit the owned noun.
  // Keep this structural and narrow: first-person merchant subject + strong business
  // capability predicate + a capability/service object. Do not treat generic “我们可以…”
  // or reasoning verbs as merchant facts.
  const subjectFirst = /(?:我们(?:家|店)|本店|店里|店内|我们(?:的)?(?:商品|产品|套餐|服务|系统|平台)|店里的(?:商品|产品|套餐|服务)|这边(?:有|在售|库存)|这款|这一款|这几款|该款|这个商品|这个套餐|这个服务|这项服务|这个版本|该版本|(?:^|[\s，,；;。！？!?])我们(?:这边)?(?:目前|现在)?(?:支持|提供|包含|具备|配备|集成)[^，,；;。！？!?]{0,24}(?:功能|能力|服务|接口|权限|模块|版本|套餐|提醒|同步|导出|登录|支付|退款|保修|发货|库存))/iu;
  if (subjectFirst.test(value)) return true;

  // Natural Chinese frequently places the merchant-owned object before the
  // first-person owner (for example “XX咨询我们目前有提供”). The ownership
  // relation is still a merchant fact even though the noun precedes “我们”. Keep
  // this generic and business-object scoped so ordinary first-person reasoning
  // ("这个问题我们有两个思路") does not become a business Claim.
  if (/^(?:如果|要是|若|假如|假设|比如|例如)/u.test(value)) return false;
  const businessObject = '(?:服务|咨询|产品|商品|套餐|功能|版本|型号|库存|现货|预约|名额|方案|保修|发货|退款|售后|报价|价格|费用|时段|排期)';
  const objectFirst = new RegExp(`${businessObject}[^，,；;。！？!?]{0,18}(?:我们|我这边|这边|本店|店里)(?:目前|现在)?(?:有|提供|支持|可提供|能提供|在售|有售|可预约|能预约|可购买|能购买)`, 'iu');
  return objectFirst.test(value);
}

export function isCustomerServiceBoundaryLikeClause(text: string) {
  return /(?:(?:目前|当前|现在|暂时|现有资料|已知资料|我这边|这边).{0,18}(?:没有|未覆盖|无法|不能|不确定|不支持(?:确认|判断|证明))|(?:目前|当前|现在|现有|已知)?(?:资料|依据|信息|明细|记录|结果).{0,8}不支持(?:确认|判断|证明)|没有(?:可靠|确认|对应|具体)?(?:资料|依据|信息|明细|记录|结果)|暂无(?:资料|依据|信息|明细|记录|结果)|不能确认|无法确认|不确定|需要核实|需要确认|(?:得看|要看|需看|需要看|取决于)[^。！？!?]{1,36}|(?:需要|需|要)(?:结合|依据)[^。！？!?]{1,36}(?:确认|确定|判断|核实|评估)|以[^。！？!?]{0,16}为准|不(?:会|能|敢|拿)?乱(?:猜|说|下结论)|先不乱(?:猜|说|下结论))/iu.test(String(text || ''));
}

function findExplicitServiceExecutionCommitmentSpan(text: string): CustomerServiceObservedActSpan | null {
  const patterns = [
    /(?:我|我这边|这边|我们)(?:现在|马上|先|这就|已经|刚刚)(?:来|会)?(?:帮你|给你)?(?:查|核实|催|处理|提交|登记|跟进|同步|通知|反馈|检查|确认|修复|联系|安排)/iu,
    /(?:我|我这边|这边|我们)(?:会|将|马上|现在就|这就|稍后|随后|之后会|后续会|接下来会|继续|再)(?:一并|继续|及时|主动)?(?:帮你|给你)?(?:处理|跟进|同步|通知|反馈|提交|登记|核实|查询|检查|确认|修复|解决|联系|安排)/iu,
    // Obligation/intention surfaces are execution commitments too; "I need to
    // check/confirm" still claims a future service action even without "will".
    /(?:我|我这边|这边|我们)(?:需要|得|要|先要|会需要)(?:先|再|马上|现在)?(?:帮你|给你)?(?:查|查询|核实|确认|处理|联系|安排|跟进|同步|反馈)/iu,
    // A first-person execution followed by a promised response is one service
    // commitment relation, even when the future modal is omitted.
    /(?:我|我这边|这边|我们)(?:查|查询|核实|确认|处理|联系|安排)[^。！？!?；;]{0,12}(?:后|之后)[^。！？!?；;]{0,10}(?:马上|再|会|及时|直接)?(?:回复|同步|通知|反馈)(?:给)?(?:你|您)?/iu,
    /(?:我|我这边|这边|我们)[^。！？!?；;]{0,18}(?:记下|记住|记录|收到)[^。！？!?；;]{0,12}(?:会|将|再|继续)?(?:一并|继续|后续)?(?:处理|跟进|同步|通知|反馈|提交|登记|核实|检查|确认)/iu,
    /(?:后续有|之后有|有|等到?)[^。！？!?；;]{0,10}(?:进展|结果|消息|更新)[^。！？!?；;]{0,12}(?:我|这边)?(?:会|再|及时|主动)?(?:同步|通知|反馈)(?:给)?(?:你|您)/iu,
  ];
  for (const clause of splitClauses(text)) {
    const value = clause.text.trim();
    if (!value) continue;
    if (/^(?:如果|要是|若|假设|假如|比如|例如|举例|有人说|有人提到)/u.test(value)) continue;
    if (/(?:不应该|不能|不要|别|避免)[^。！？!?；;]{0,12}(?:承诺|说|表示|回复|写)/u.test(value)) continue;
    for (const pattern of patterns) {
      const local = findPatternSpan(value, pattern);
      if (!local || isInsideQuotedExecutionRange(value, local.start, local.end)) continue;
      const offset = clause.text.indexOf(value);
      return {
        start: clause.start + offset + local.start,
        end: clause.start + offset + local.end,
        text: value.slice(local.start, local.end),
      };
    }
  }
  return null;
}

function isInsideQuotedExecutionRange(text: string, start: number, end: number) {
  const pairs: Array<[string, string]> = [['“', '”'], ['「', '」'], ['『', '』'], ['"', '"'], ["'", "'"]];
  for (const [open, close] of pairs) {
    let cursor = 0;
    while (cursor < text.length) {
      const openIndex = text.indexOf(open, cursor);
      if (openIndex < 0) break;
      const closeIndex = text.indexOf(close, openIndex + open.length);
      if (closeIndex < 0) break;
      if (start >= openIndex && start < closeIndex + close.length) return true;
      cursor = closeIndex + close.length;
    }
  }
  return false;
}

function findExplicitHandoffSpan(text: string): CustomerServiceObservedActSpan | null {
  const patterns = [
    /(?:我|这边)(?:现在|马上|这就|先)?(?:帮你|给你)?(?:转(?:人工|人工客服)|安排(?:人工|专员)|交给(?:人工|专员))/iu,
    /(?:需要|得|要)(?:由)?(?:人工客服|人工|专员)(?:来)?(?:处理|接手)/iu,
    /(?:转到|转给)(?:人工客服|人工|专员)/iu,
  ];
  for (const clause of splitClauses(text)) {
    const value = clause.text.trim();
    if (!value) continue;
    // Hypothetical/conditional mentions of humans are not a handoff decision.
    if (/^(?:如果|要是|若|后面如果|后续如果|之后如果)/u.test(value)
      && !/(?:我|这边)(?:现在|马上|这就)?(?:帮你|给你)?(?:转|安排|交给)/u.test(value)) continue;
    for (const pattern of patterns) {
      const local = findPatternSpan(value, pattern);
      if (!local || isInsideQuotedExecutionRange(value, local.start, local.end)) continue;
      const prefix = value.slice(Math.max(0, local.start - 14), local.start);
      // "不需要人工处理" / "是否需要人工处理？" describe the opposite
      // or ask about a possibility. They must never manufacture a hard unexpected
      // REQUEST_HANDOFF Act from lexical overlap.
      if (/(?:不需要|无需|不用|不必|没必要|不要|别|暂时不用|目前不用)[^。！？!?；;]{0,4}$/iu.test(prefix)) continue;
      if (/^(?:需要|得|要)/iu.test(local.text) && /(?:不|无需|不用|不必|没必要|不要|别)\s*$/iu.test(prefix)) continue;
      if (/(?:是否|要不要|需不需要|是不是|能不能|可不可以)\s*$/iu.test(prefix)) continue;
      if (/[?？]/u.test(value)
        && (/(?:是否|要不要|需不需要|是不是|能不能|可不可以)\s*$/iu.test(prefix)
          || /(?:可以吗|要吗|需要吗|吗)[^。！？!?；;]{0,4}$/iu.test(value.slice(local.start, Math.min(value.length, local.end + 6))))) continue;
      const offset = clause.text.indexOf(value);
      return {
        start: clause.start + offset + local.start,
        end: clause.start + offset + local.end,
        text: value.slice(local.start, local.end),
      };
    }
  }
  return null;
}

function findPositiveAiIdentitySpan(text: string) {
  const candidates = [
    /(?:我是|我这边是|这边是|作为|属于|是的[，,\s]*|对[，,\s]*)(?:一名|一个|店里的|这边的)?(?:智能客服|AI(?:客服)?|人工智能(?:客服)?|机器人(?:客服)?)/i,
    /(?:智能客服|AI客服|人工智能客服|机器人客服)/i,
  ];
  for (const pattern of candidates) {
    const span = findPatternSpan(text, pattern);
    if (!span) continue;
    const prefix = text.slice(Math.max(0, span.start - 8), span.start + Math.min(span.text.length, 3));
    if (/(?:不是|不是什么|并非|不算|不是个|不是一个)\s*$/i.test(prefix)) continue;
    if (/(?:不是什么|不是|并非).{0,5}(?:AI|人工智能|机器人|智能客服)/i.test(span.text)) continue;
    return span;
  }
  return null;
}

function findRequestOrQuestionClause(text: string, requiredPattern: RegExp) {
  for (const clause of splitClauses(text)) {
    if (!testPattern(requiredPattern, clause.text)) continue;
    if (/[?？]/.test(clause.text) || /(?:请|麻烦|需要(?:你|您)?|能不能|能否|把|发我|给我|提供|告诉我|确认一下|补充一下)/i.test(clause.text)) return clause;
  }
  return null;
}

function findQuestionClause(text: string, requiredPattern?: RegExp) {
  for (const clause of splitClauses(text)) {
    if (!/[?？]/.test(clause.text)) continue;
    if (!requiredPattern || testPattern(requiredPattern, clause.text)) return clause;
  }
  return null;
}

function splitClauses(text: string): CustomerServiceObservedActSpan[] {
  const spans: CustomerServiceObservedActSpan[] = [];
  const pattern = /[^。！？!?；;\n]+[。！？!?；;]?/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const raw = match[0];
    const leading = raw.match(/^\s*/u)?.[0].length || 0;
    const trailing = raw.match(/\s*$/u)?.[0].length || 0;
    const start = match.index + leading;
    const end = match.index + raw.length - trailing;
    if (end > start) spans.push({ start, end, text: text.slice(start, end) });
  }
  return spans;
}

function findPatternSpan(text: string, pattern: RegExp): CustomerServiceObservedActSpan | null {
  const flags = pattern.flags.replace(/g/g, '');
  const matcher = new RegExp(pattern.source, flags);
  const match = matcher.exec(text);
  if (!match || match.index < 0) return null;
  return { start: match.index, end: match.index + match[0].length, text: match[0] };
}

function findLiteralSpan(text: string, literal: string): CustomerServiceObservedActSpan | null {
  const index = text.indexOf(literal);
  return index < 0 ? null : { start: index, end: index + literal.length, text: literal };
}

function testPattern(pattern: RegExp, text: string) {
  return new RegExp(pattern.source, pattern.flags.replace(/g/g, '')).test(text);
}

function fromSpan(
  type: CustomerServiceActType,
  span: CustomerServiceObservedActSpan | null,
  hitConfidence: number,
  missConfidence: number,
  evidence: string,
) {
  return result(type, span ? 'OBSERVED' : 'NOT_OBSERVED', span ? hitConfidence : missConfidence, span ? [evidence] : [], [], span ? [span] : []);
}

function result(
  type: CustomerServiceActType,
  observation: CustomerServiceObservedAct['observation'],
  confidence: number,
  evidence: string[],
  groundingRefs: string[] = [],
  spans: CustomerServiceObservedActSpan[] = [],
  claimScope: CustomerServiceObservedClaimScope = 'NONE',
  provenance: CustomerServiceObservedClaimProvenance = groundingRefs.length ? 'BUSINESS_GROUNDING' : 'NONE',
): CustomerServiceObservedAct {
  return { type, observation, confidence, evidence, groundingRefs, spans, claimScope, provenance };
}

function uniqueStrings(values: Array<unknown>) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function compact(value: unknown) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s，。！？、,.!?；;：:“”"'（）()\[\]【】]/g, '');
}
