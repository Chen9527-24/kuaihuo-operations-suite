export type CustomerServiceRoleStatus = 'DRAFT' | 'ENABLED' | 'ARCHIVED';


export type CustomerServiceRoleSpeakerPreset = 'BALANCED_HUMAN' | 'WARM_RELAXED' | 'CALM_PROFESSIONAL' | 'DIRECT_EFFICIENT' | 'CUSTOM';
export type CustomerServiceRoleSpeakerLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface CustomerServiceRoleSpeakerProfileV1 {
  schemaVersion: 1;
  preset: CustomerServiceRoleSpeakerPreset;
  corePresence: {
    warmth: number; directness: number; formality: number; energy: number; playfulness: number; emotionalExpressiveness: number;
  };
  conversationalTexture: {
    colloquiality: CustomerServiceRoleSpeakerLevel;
    brevity: 'COMPACT' | 'BALANCED' | 'EXPANSIVE';
    sentenceShape: 'CRISP' | 'MIXED' | 'FLOWING';
    fragmentTolerance: CustomerServiceRoleSpeakerLevel;
    ellipsisTolerance: CustomerServiceRoleSpeakerLevel;
    completionCadence: CustomerServiceRoleSpeakerLevel;
    rhythmVariation: CustomerServiceRoleSpeakerLevel;
  };
  interactionStyle: {
    proactivity: 'RESTRAINED' | 'BALANCED' | 'PROACTIVE';
    questionStyle: 'MINIMAL' | 'DECISION_FOCUSED' | 'EXPLORATORY';
    adviceStyle: 'RESTRAINED' | 'BALANCED' | 'ASSERTIVE';
    empathyStyle: 'LIGHT' | 'BALANCED' | 'EXPRESSIVE';
    humorTolerance: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  };
  relationshipStyle: {
    baselineDistance: 'PROFESSIONAL' | 'PROFESSIONAL_FRIENDLY' | 'FAMILIAR';
    familiarityAdaptation: 'FIXED' | 'GRADUAL' | 'RESPONSIVE';
  };
  deliveryStyle: {
    segmentation: 'COMPACT' | 'NATURAL' | 'SEQUENTIAL';
    emoji: 'NONE' | 'LIGHT' | 'NATURAL';
    sentenceParticleLevel: CustomerServiceRoleSpeakerLevel;
  };
}

export interface CustomerServiceRolePrototype {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  identity: string | null;
  personality: string | null;
  languageStyle: string | null;
  servicePosture: string | null;
  speakerProfile: CustomerServiceRoleSpeakerProfileV1 | null;
  status: CustomerServiceRoleStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerServiceRoleQuery {
  keyword?: string;
  status?: string;
  page: number;
  pageSize: number;
}

export interface CustomerServiceRolePayload {
  code?: string;
  name: string;
  description?: string;
  identity?: string;
  personality?: string;
  languageStyle?: string;
  servicePosture?: string;
  speakerProfile?: CustomerServiceRoleSpeakerProfileV1 | null;
  status: CustomerServiceRoleStatus;
  revision?: number;
}
