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

export type CustomerServiceFoundationResult = {
  tenantId: string;
  initialized: boolean;
  created: Record<CustomerServiceFoundationResource, number>;
  existing: Record<CustomerServiceFoundationResource, number>;
  warnings: string[];
};
