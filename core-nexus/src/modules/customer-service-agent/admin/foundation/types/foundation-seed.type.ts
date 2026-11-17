import { Prisma } from '@prisma/client';

export type CustomerServiceFoundationTx = Prisma.TransactionClient;
export type CustomerServiceIndustrySeedMap = Map<string, { id: string; path: string; level: number }>;
export type CustomerServiceEntitySeedMap = Map<string, { id: string }>;
export type CustomerServiceResponseAssetSeedMap = Map<string, { id: string; ready: boolean }>;
