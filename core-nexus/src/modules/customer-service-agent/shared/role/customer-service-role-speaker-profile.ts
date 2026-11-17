export const CUSTOMER_SERVICE_ROLE_SPEAKER_PRESETS = [
  'BALANCED_HUMAN',
  'WARM_RELAXED',
  'CALM_PROFESSIONAL',
  'DIRECT_EFFICIENT',
  'CUSTOM',
] as const;

export type CustomerServiceRoleSpeakerPreset = typeof CUSTOMER_SERVICE_ROLE_SPEAKER_PRESETS[number];
export type CustomerServiceRoleSpeakerLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type CustomerServiceRoleSpeakerBrevity = 'COMPACT' | 'BALANCED' | 'EXPANSIVE';
export type CustomerServiceRoleSpeakerSentenceShape = 'CRISP' | 'MIXED' | 'FLOWING';
export type CustomerServiceRoleSpeakerProactivity = 'RESTRAINED' | 'BALANCED' | 'PROACTIVE';
export type CustomerServiceRoleSpeakerQuestionStyle = 'MINIMAL' | 'DECISION_FOCUSED' | 'EXPLORATORY';
export type CustomerServiceRoleSpeakerAdviceStyle = 'RESTRAINED' | 'BALANCED' | 'ASSERTIVE';
export type CustomerServiceRoleSpeakerEmpathyStyle = 'LIGHT' | 'BALANCED' | 'EXPRESSIVE';
export type CustomerServiceRoleSpeakerHumorTolerance = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type CustomerServiceRoleSpeakerDistance = 'PROFESSIONAL' | 'PROFESSIONAL_FRIENDLY' | 'FAMILIAR';
export type CustomerServiceRoleSpeakerFamiliarityAdaptation = 'FIXED' | 'GRADUAL' | 'RESPONSIVE';
export type CustomerServiceRoleSpeakerSegmentation = 'COMPACT' | 'NATURAL' | 'SEQUENTIAL';
export type CustomerServiceRoleSpeakerEmoji = 'NONE' | 'LIGHT' | 'NATURAL';

export type CustomerServiceRoleSpeakerProfileV1 = {
  schemaVersion: 1;
  preset: CustomerServiceRoleSpeakerPreset;
  corePresence: {
    warmth: number;
    directness: number;
    formality: number;
    energy: number;
    playfulness: number;
    emotionalExpressiveness: number;
  };
  conversationalTexture: {
    colloquiality: CustomerServiceRoleSpeakerLevel;
    brevity: CustomerServiceRoleSpeakerBrevity;
    sentenceShape: CustomerServiceRoleSpeakerSentenceShape;
    fragmentTolerance: CustomerServiceRoleSpeakerLevel;
    ellipsisTolerance: CustomerServiceRoleSpeakerLevel;
    completionCadence: CustomerServiceRoleSpeakerLevel;
    rhythmVariation: CustomerServiceRoleSpeakerLevel;
  };
  interactionStyle: {
    proactivity: CustomerServiceRoleSpeakerProactivity;
    questionStyle: CustomerServiceRoleSpeakerQuestionStyle;
    adviceStyle: CustomerServiceRoleSpeakerAdviceStyle;
    empathyStyle: CustomerServiceRoleSpeakerEmpathyStyle;
    humorTolerance: CustomerServiceRoleSpeakerHumorTolerance;
  };
  relationshipStyle: {
    baselineDistance: CustomerServiceRoleSpeakerDistance;
    familiarityAdaptation: CustomerServiceRoleSpeakerFamiliarityAdaptation;
  };
  deliveryStyle: {
    segmentation: CustomerServiceRoleSpeakerSegmentation;
    emoji: CustomerServiceRoleSpeakerEmoji;
    sentenceParticleLevel: CustomerServiceRoleSpeakerLevel;
  };
};

export type CustomerServiceRoleSpeakerProfileParseResult = {
  profile: CustomerServiceRoleSpeakerProfileV1 | null;
  issues: string[];
};

const PRESETS: Record<Exclude<CustomerServiceRoleSpeakerPreset, 'CUSTOM'>, CustomerServiceRoleSpeakerProfileV1> = {
  BALANCED_HUMAN: buildPreset('BALANCED_HUMAN', {
    corePresence: { warmth: 60, directness: 60, formality: 45, energy: 50, playfulness: 20, emotionalExpressiveness: 45 },
  }),
  WARM_RELAXED: buildPreset('WARM_RELAXED', {
    corePresence: { warmth: 78, directness: 52, formality: 25, energy: 62, playfulness: 42, emotionalExpressiveness: 65 },
    conversationalTexture: { colloquiality: 'HIGH', brevity: 'BALANCED', sentenceShape: 'MIXED', fragmentTolerance: 'HIGH', ellipsisTolerance: 'MEDIUM', completionCadence: 'LOW', rhythmVariation: 'HIGH' },
    interactionStyle: { proactivity: 'BALANCED', questionStyle: 'DECISION_FOCUSED', adviceStyle: 'BALANCED', empathyStyle: 'EXPRESSIVE', humorTolerance: 'MEDIUM' },
    relationshipStyle: { baselineDistance: 'PROFESSIONAL_FRIENDLY', familiarityAdaptation: 'RESPONSIVE' },
    deliveryStyle: { segmentation: 'NATURAL', emoji: 'NATURAL', sentenceParticleLevel: 'MEDIUM' },
  }),
  CALM_PROFESSIONAL: buildPreset('CALM_PROFESSIONAL', {
    corePresence: { warmth: 58, directness: 70, formality: 72, energy: 38, playfulness: 5, emotionalExpressiveness: 30 },
    conversationalTexture: { colloquiality: 'LOW', brevity: 'BALANCED', sentenceShape: 'CRISP', fragmentTolerance: 'LOW', ellipsisTolerance: 'LOW', completionCadence: 'MEDIUM', rhythmVariation: 'MEDIUM' },
    interactionStyle: { proactivity: 'BALANCED', questionStyle: 'DECISION_FOCUSED', adviceStyle: 'BALANCED', empathyStyle: 'LIGHT', humorTolerance: 'LOW' },
    relationshipStyle: { baselineDistance: 'PROFESSIONAL', familiarityAdaptation: 'GRADUAL' },
    deliveryStyle: { segmentation: 'COMPACT', emoji: 'NONE', sentenceParticleLevel: 'LOW' },
  }),
  DIRECT_EFFICIENT: buildPreset('DIRECT_EFFICIENT', {
    corePresence: { warmth: 45, directness: 86, formality: 58, energy: 56, playfulness: 3, emotionalExpressiveness: 22 },
    conversationalTexture: { colloquiality: 'MEDIUM', brevity: 'COMPACT', sentenceShape: 'CRISP', fragmentTolerance: 'MEDIUM', ellipsisTolerance: 'LOW', completionCadence: 'LOW', rhythmVariation: 'MEDIUM' },
    interactionStyle: { proactivity: 'PROACTIVE', questionStyle: 'DECISION_FOCUSED', adviceStyle: 'ASSERTIVE', empathyStyle: 'LIGHT', humorTolerance: 'NONE' },
    relationshipStyle: { baselineDistance: 'PROFESSIONAL', familiarityAdaptation: 'FIXED' },
    deliveryStyle: { segmentation: 'COMPACT', emoji: 'NONE', sentenceParticleLevel: 'LOW' },
  }),
};

export function customerServiceRoleSpeakerPreset(preset: CustomerServiceRoleSpeakerPreset): CustomerServiceRoleSpeakerProfileV1 {
  if (preset === 'CUSTOM') return { ...cloneProfile(PRESETS.BALANCED_HUMAN), preset: 'CUSTOM' };
  return cloneProfile(PRESETS[preset]);
}

export function defaultCustomerServiceRoleSpeakerProfile(): CustomerServiceRoleSpeakerProfileV1 {
  return customerServiceRoleSpeakerPreset('BALANCED_HUMAN');
}

export function parseCustomerServiceRoleSpeakerProfile(value: unknown): CustomerServiceRoleSpeakerProfileParseResult {
  if (value === null || value === undefined || value === '') return { profile: null, issues: [] };
  const root = asRecord(value);
  if (!root) return { profile: null, issues: ['speakerProfile 必须是对象'] };
  const issues: string[] = [];
  if (root.schemaVersion !== 1) issues.push('schemaVersion 必须是 1');
  if (root.preset === undefined || root.preset === null || root.preset === '') issues.push('preset 必填');
  const preset = enumValue(root.preset, CUSTOMER_SERVICE_ROLE_SPEAKER_PRESETS, 'preset', issues, 'CUSTOM');
  const baseline = customerServiceRoleSpeakerPreset(preset);
  const core = asRecord(root.corePresence);
  const texture = asRecord(root.conversationalTexture);
  const interaction = asRecord(root.interactionStyle);
  const relationship = asRecord(root.relationshipStyle);
  const delivery = asRecord(root.deliveryStyle);
  if (!core) issues.push('corePresence 必须是对象');
  if (!texture) issues.push('conversationalTexture 必须是对象');
  if (!interaction) issues.push('interactionStyle 必须是对象');
  if (!relationship) issues.push('relationshipStyle 必须是对象');
  if (!delivery) issues.push('deliveryStyle 必须是对象');
  if (core) requireKeys(core, ['warmth', 'directness', 'formality', 'energy', 'playfulness', 'emotionalExpressiveness'], 'corePresence', issues);
  if (texture) requireKeys(texture, ['colloquiality', 'brevity', 'sentenceShape', 'fragmentTolerance', 'ellipsisTolerance', 'completionCadence', 'rhythmVariation'], 'conversationalTexture', issues);
  if (interaction) requireKeys(interaction, ['proactivity', 'questionStyle', 'adviceStyle', 'empathyStyle', 'humorTolerance'], 'interactionStyle', issues);
  if (relationship) requireKeys(relationship, ['baselineDistance', 'familiarityAdaptation'], 'relationshipStyle', issues);
  if (delivery) requireKeys(delivery, ['segmentation', 'emoji', 'sentenceParticleLevel'], 'deliveryStyle', issues);

  const profile: CustomerServiceRoleSpeakerProfileV1 = {
    schemaVersion: 1,
    preset,
    corePresence: {
      warmth: score(core?.warmth, 'corePresence.warmth', issues, baseline.corePresence.warmth),
      directness: score(core?.directness, 'corePresence.directness', issues, baseline.corePresence.directness),
      formality: score(core?.formality, 'corePresence.formality', issues, baseline.corePresence.formality),
      energy: score(core?.energy, 'corePresence.energy', issues, baseline.corePresence.energy),
      playfulness: score(core?.playfulness, 'corePresence.playfulness', issues, baseline.corePresence.playfulness),
      emotionalExpressiveness: score(core?.emotionalExpressiveness, 'corePresence.emotionalExpressiveness', issues, baseline.corePresence.emotionalExpressiveness),
    },
    conversationalTexture: {
      colloquiality: enumValue(texture?.colloquiality, LEVELS, 'conversationalTexture.colloquiality', issues, baseline.conversationalTexture.colloquiality),
      brevity: enumValue(texture?.brevity, BREVITY, 'conversationalTexture.brevity', issues, baseline.conversationalTexture.brevity),
      sentenceShape: enumValue(texture?.sentenceShape, SENTENCE_SHAPES, 'conversationalTexture.sentenceShape', issues, baseline.conversationalTexture.sentenceShape),
      fragmentTolerance: enumValue(texture?.fragmentTolerance, LEVELS, 'conversationalTexture.fragmentTolerance', issues, baseline.conversationalTexture.fragmentTolerance),
      ellipsisTolerance: enumValue(texture?.ellipsisTolerance, LEVELS, 'conversationalTexture.ellipsisTolerance', issues, baseline.conversationalTexture.ellipsisTolerance),
      completionCadence: enumValue(texture?.completionCadence, LEVELS, 'conversationalTexture.completionCadence', issues, baseline.conversationalTexture.completionCadence),
      rhythmVariation: enumValue(texture?.rhythmVariation, LEVELS, 'conversationalTexture.rhythmVariation', issues, baseline.conversationalTexture.rhythmVariation),
    },
    interactionStyle: {
      proactivity: enumValue(interaction?.proactivity, PROACTIVITY, 'interactionStyle.proactivity', issues, baseline.interactionStyle.proactivity),
      questionStyle: enumValue(interaction?.questionStyle, QUESTION_STYLES, 'interactionStyle.questionStyle', issues, baseline.interactionStyle.questionStyle),
      adviceStyle: enumValue(interaction?.adviceStyle, ADVICE_STYLES, 'interactionStyle.adviceStyle', issues, baseline.interactionStyle.adviceStyle),
      empathyStyle: enumValue(interaction?.empathyStyle, EMPATHY_STYLES, 'interactionStyle.empathyStyle', issues, baseline.interactionStyle.empathyStyle),
      humorTolerance: enumValue(interaction?.humorTolerance, HUMOR_TOLERANCE, 'interactionStyle.humorTolerance', issues, baseline.interactionStyle.humorTolerance),
    },
    relationshipStyle: {
      baselineDistance: enumValue(relationship?.baselineDistance, DISTANCES, 'relationshipStyle.baselineDistance', issues, baseline.relationshipStyle.baselineDistance),
      familiarityAdaptation: enumValue(relationship?.familiarityAdaptation, FAMILIARITY, 'relationshipStyle.familiarityAdaptation', issues, baseline.relationshipStyle.familiarityAdaptation),
    },
    deliveryStyle: {
      segmentation: enumValue(delivery?.segmentation, SEGMENTATION, 'deliveryStyle.segmentation', issues, baseline.deliveryStyle.segmentation),
      emoji: enumValue(delivery?.emoji, EMOJI, 'deliveryStyle.emoji', issues, baseline.deliveryStyle.emoji),
      sentenceParticleLevel: enumValue(delivery?.sentenceParticleLevel, LEVELS, 'deliveryStyle.sentenceParticleLevel', issues, baseline.deliveryStyle.sentenceParticleLevel),
    },
  };
  return { profile: issues.length ? null : profile, issues };
}

const LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
const BREVITY = ['COMPACT', 'BALANCED', 'EXPANSIVE'] as const;
const SENTENCE_SHAPES = ['CRISP', 'MIXED', 'FLOWING'] as const;
const PROACTIVITY = ['RESTRAINED', 'BALANCED', 'PROACTIVE'] as const;
const QUESTION_STYLES = ['MINIMAL', 'DECISION_FOCUSED', 'EXPLORATORY'] as const;
const ADVICE_STYLES = ['RESTRAINED', 'BALANCED', 'ASSERTIVE'] as const;
const EMPATHY_STYLES = ['LIGHT', 'BALANCED', 'EXPRESSIVE'] as const;
const HUMOR_TOLERANCE = ['NONE', 'LOW', 'MEDIUM', 'HIGH'] as const;
const DISTANCES = ['PROFESSIONAL', 'PROFESSIONAL_FRIENDLY', 'FAMILIAR'] as const;
const FAMILIARITY = ['FIXED', 'GRADUAL', 'RESPONSIVE'] as const;
const SEGMENTATION = ['COMPACT', 'NATURAL', 'SEQUENTIAL'] as const;
const EMOJI = ['NONE', 'LIGHT', 'NATURAL'] as const;

function buildPreset(
  preset: Exclude<CustomerServiceRoleSpeakerPreset, 'CUSTOM'>,
  override: Partial<Omit<CustomerServiceRoleSpeakerProfileV1, 'schemaVersion' | 'preset'>>,
): CustomerServiceRoleSpeakerProfileV1 {
  const base = {
    schemaVersion: 1 as const,
    preset,
    corePresence: { warmth: 60, directness: 60, formality: 45, energy: 50, playfulness: 20, emotionalExpressiveness: 45 },
    conversationalTexture: { colloquiality: 'MEDIUM' as const, brevity: 'BALANCED' as const, sentenceShape: 'MIXED' as const, fragmentTolerance: 'MEDIUM' as const, ellipsisTolerance: 'LOW' as const, completionCadence: 'LOW' as const, rhythmVariation: 'MEDIUM' as const },
    interactionStyle: { proactivity: 'BALANCED' as const, questionStyle: 'DECISION_FOCUSED' as const, adviceStyle: 'BALANCED' as const, empathyStyle: 'BALANCED' as const, humorTolerance: 'LOW' as const },
    relationshipStyle: { baselineDistance: 'PROFESSIONAL_FRIENDLY' as const, familiarityAdaptation: 'GRADUAL' as const },
    deliveryStyle: { segmentation: 'NATURAL' as const, emoji: 'LIGHT' as const, sentenceParticleLevel: 'LOW' as const },
  };
  return {
    ...base,
    ...override,
    corePresence: { ...base.corePresence, ...(override.corePresence || {}) },
    conversationalTexture: { ...base.conversationalTexture, ...(override.conversationalTexture || {}) },
    interactionStyle: { ...base.interactionStyle, ...(override.interactionStyle || {}) },
    relationshipStyle: { ...base.relationshipStyle, ...(override.relationshipStyle || {}) },
    deliveryStyle: { ...base.deliveryStyle, ...(override.deliveryStyle || {}) },
  };
}

function cloneProfile(profile: CustomerServiceRoleSpeakerProfileV1): CustomerServiceRoleSpeakerProfileV1 {
  return JSON.parse(JSON.stringify(profile)) as CustomerServiceRoleSpeakerProfileV1;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function requireKeys(record: Record<string, unknown>, keys: readonly string[], prefix: string, issues: string[]) {
  for (const key of keys) {
    if (record[key] === undefined || record[key] === null || record[key] === '') issues.push(`${prefix}.${key} 必填`);
  }
}

function score(value: unknown, path: string, issues: string[], fallback: number) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    issues.push(`${path} 必须是 0-100 的数值`);
    return fallback;
  }
  return Math.round(numeric);
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: string[],
  fallback: T,
): T {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toUpperCase() as T;
  if (!allowed.includes(normalized)) {
    issues.push(`${path} 必须是 ${allowed.join(' / ')}`);
    return fallback;
  }
  return normalized;
}
