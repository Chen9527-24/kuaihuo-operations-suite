import { Prisma } from '@prisma/client';
import { DEFAULT_RUNTIME_POLICY, withDefaultRuntimePolicy } from './runtime-policy.defaults';

export type RuntimePolicy = typeof DEFAULT_RUNTIME_POLICY;
export { DEFAULT_RUNTIME_POLICY };

export function normalizeRuntimePolicy(input: unknown): RuntimePolicy {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  return withDefaultRuntimePolicy({ runtimePolicy: source }).runtimePolicy as RuntimePolicy;
}

export function mergeRobotConfigWithRuntimePolicy(config: unknown): Prisma.InputJsonValue {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
  return withDefaultRuntimePolicy(source) as Prisma.InputJsonValue;
}
