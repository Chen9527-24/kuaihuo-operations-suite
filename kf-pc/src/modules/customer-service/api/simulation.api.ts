import { request } from '@/api/core/http';
import { unwrapData } from '@/utils/apiData';
import type {
  CustomerServiceSimulationCompilePayload,
  CustomerServiceSimulationCompileResult,
  CustomerServiceSimulationExecutePayload,
  CustomerServiceSimulationExecutionResult
} from '../types/simulation.types';

export async function compileCustomerServiceSimulation(
  payload: CustomerServiceSimulationCompilePayload
): Promise<CustomerServiceSimulationCompileResult> {
  return unwrapData(
    await request({ path: '/customer-service/admin/simulations/compile', method: 'POST', body: payload as unknown as Record<string, unknown>, apiVersion: 5 })
  );
}

export async function executeCustomerServiceSimulation(
  payload: CustomerServiceSimulationExecutePayload
): Promise<CustomerServiceSimulationExecutionResult> {
  return unwrapData(
    await request({ path: '/customer-service/admin/simulations/execute', method: 'POST', body: payload as unknown as Record<string, unknown>, apiVersion: 5 })
  );
}
