export type CustomerServiceFoundationResource =
  | 'industryNodes'
  | 'rolePrototypes'
  | 'merchantRoles'
  | 'roleModules'
  | 'responseAssets'
  | 'responseRules'
  | 'qualityRules'
  | 'evaluationCases'
  | 'intentDefinitions';

export interface CustomerServiceFoundationStatus {
  tenantId: string;
  initialized: boolean;
  expected: Record<CustomerServiceFoundationResource, number>;
  actual: Record<CustomerServiceFoundationResource, number>;
}

export interface CustomerServiceFoundationResult {
  tenantId: string;
  initialized: boolean;
  created: Record<CustomerServiceFoundationResource, number>;
  existing: Record<CustomerServiceFoundationResource, number>;
  warnings: string[];
}


export interface CustomerServiceAliFlagshipSyncResult {
  tenantId: string;
  prototypeId: string;
  roleId: string;
  roleCode: 'ali';
  createdModules: number;
  updatedModules: number;
  disabledLegacyModules: number;
  sanitizedProfiles: number;
  baselineProfiles: number;
  archivedLegacyCalibrationProfiles?: number;
  upgradedStrategyGroups?: number;
  strategyUpgradeDrafts?: number;
  strategyGroupsUnchanged?: number;
  evaluationCases: number;
  intentDefinitionsCreated: number;
  intentDefinitionsExisting: number;
  historyPreserved: true;
}
