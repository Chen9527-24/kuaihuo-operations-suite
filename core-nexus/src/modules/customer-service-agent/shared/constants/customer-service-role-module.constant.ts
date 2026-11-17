export const CUSTOMER_SERVICE_ROLE_MODULE_MERGE_MODES = ['OVERRIDE', 'APPEND', 'STRICTER'] as const;
export const CUSTOMER_SERVICE_ROLE_MODULE_STATUSES = ['ENABLED', 'DISABLED', 'ARCHIVED'] as const;
export const CUSTOMER_SERVICE_SIMULATION_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type CustomerServiceRoleModuleMergeMode = (typeof CUSTOMER_SERVICE_ROLE_MODULE_MERGE_MODES)[number];
export type CustomerServiceRoleModuleStatus = (typeof CUSTOMER_SERVICE_ROLE_MODULE_STATUSES)[number];
export type CustomerServiceSimulationRiskLevel = (typeof CUSTOMER_SERVICE_SIMULATION_RISK_LEVELS)[number];
