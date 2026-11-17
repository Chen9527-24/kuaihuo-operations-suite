import { PrismaClient } from '@prisma/client';
import {
  ensureSeedAdminRoleBinding,
  syncCustomerServiceRoleModuleDefinitions,
  syncSystemAccessControl,
  syncSystemDicts,
} from './system-data';

const prisma = new PrismaClient();

async function main() {
  await syncSystemDicts(prisma);
  await syncSystemAccessControl(prisma);
  await syncCustomerServiceRoleModuleDefinitions(prisma);
  const adminBinding = await ensureSeedAdminRoleBinding(prisma);
  if (adminBinding.bound) {
    console.log(`Admin role binding ensured for user: ${adminBinding.username}`);
  } else {
    console.warn(`Admin role binding skipped for user: ${adminBinding.username || '(empty)'} (${adminBinding.reason})`);
  }
  console.log('System dictionaries, permissions, roles, and customer service module definitions synced successfully.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
