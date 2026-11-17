import fixture from '@/modules/customer-service/fixtures/hve-standard-qinghe-fashion.json';
import {
  createCustomerServiceAccountProfile,
  createCustomerServiceStoreProfile,
  listCustomerServiceAccountProfiles,
  listCustomerServiceStoreProfiles,
  updateCustomerServiceAccountProfile,
  updateCustomerServiceStoreProfile,
} from '@/modules/customer-service/api/context-profiles.api';
import {
  batchImportCustomerServiceKnowledge,
  createCustomerServiceKnowledgeCollection,
  createCustomerServiceKnowledgeEntry,
  listCustomerServiceKnowledgeBindings,
  listCustomerServiceKnowledgeCollections,
  listCustomerServiceKnowledgeEntries,
  updateCustomerServiceKnowledgeCollection,
  updateCustomerServiceKnowledgeEntry,
  upsertCustomerServiceKnowledgeBinding,
} from '@/modules/customer-service/api/knowledge-entries.api';
import type { CustomerServiceIndustryNode } from '@/modules/customer-service/types/industries.types';
import type { CustomerServiceMerchantRole } from '@/modules/customer-service/types/merchant-roles.types';
import type {
  CustomerServiceAccountChannel,
  CustomerServiceKnowledgeEntryPayload,
} from '@/modules/customer-service/types/context-profiles.types';

export const HVE_STANDARD_STORE_FIXTURE_CODE = fixture.account.code;
export const HVE_STANDARD_STORE_FIXTURE_NAME = fixture.account.name;
export const HVE_STANDARD_STORE_FIXTURE_KEY = fixture.fixtureKey;
export const HVE_STANDARD_STORE_FIXTURE_TEST_PROMPTS = fixture.testPrompts;
export const HVE_STANDARD_STORE_FIXTURE_UNMATCHED_NAMES = fixture.unmatchedTestNames;

interface InstallOptions {
  roles: CustomerServiceMerchantRole[];
  industries: CustomerServiceIndustryNode[];
}

function includesFashionIndustry(node: CustomerServiceIndustryNode) {
  const text = `${node.code} ${node.name} ${node.description || ''} ${node.path || ''}`.toLowerCase();
  return ['服饰', '女装', 'fashion', 'apparel'].some((keyword) => text.includes(keyword));
}

function resolveRole(roles: CustomerServiceMerchantRole[]) {
  const enabled = roles.filter((item) => item.status === 'ENABLED');
  return enabled.find((item) => item.code === 'ali') || enabled[0] || null;
}

function entryIdentity(item: Record<string, unknown>) {
  const entityKey = String(item.entityKey || '').trim();
  return entityKey ? `entity:${entityKey}` : `title:${String(item.title || '').trim()}`;
}

function toEntryPayload(collectionId: string, raw: Record<string, unknown>): CustomerServiceKnowledgeEntryPayload {
  return {
    collectionId,
    scopeType: 'COLLECTION',
    scopeKey: collectionId,
    category: raw.category as CustomerServiceKnowledgeEntryPayload['category'],
    title: String(raw.title || '').trim(),
    question: raw.question ? String(raw.question) : null,
    content: String(raw.content || '').trim(),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    sourceType: (raw.sourceType || 'IMPORT') as CustomerServiceKnowledgeEntryPayload['sourceType'],
    sourceReference: raw.sourceReference ? String(raw.sourceReference) : null,
    effectiveFrom: null,
    effectiveTo: null,
    freshnessPolicy: raw.freshnessPolicy ? String(raw.freshnessPolicy) : null,
    status: 'ENABLED',
    entityType: raw.entityType ? String(raw.entityType) : 'GENERIC',
    entityKey: raw.entityKey ? String(raw.entityKey) : null,
    aliases: Array.isArray(raw.aliases) ? raw.aliases.map(String) : [],
    knowledgeKind: raw.knowledgeKind ? String(raw.knowledgeKind).trim().toUpperCase() as CustomerServiceKnowledgeEntryPayload['knowledgeKind'] : undefined,
    taxonomyKeys: Array.isArray(raw.taxonomyKeys) ? raw.taxonomyKeys.map(String).map((item) => item.trim()).filter(Boolean) : [],
    structuredData: raw.structuredData && typeof raw.structuredData === 'object' ? raw.structuredData as Record<string, unknown> : undefined,
    references: Array.isArray(raw.references) ? raw.references as CustomerServiceKnowledgeEntryPayload['references'] : undefined,
    authorityLevel: raw.authorityLevel ? String(raw.authorityLevel) : 'BUSINESS_FACT',
    chunkIndex: null,
    sourceFileName: 'hve-standard-qinghe-fashion.json',
  };
}

export async function installOrRepairHveStandardStoreFixture(options: InstallOptions) {
  const role = resolveRole(options.roles);
  if (!role) throw new Error('没有已启用的客服角色，无法安装 HVE 标准测试身份');
  const industry = options.industries.find((item) => item.status === 'ENABLED' && includesFashionIndustry(item)) || null;

  const [storePage, accountPage] = await Promise.all([
    listCustomerServiceStoreProfiles({ page: 1, pageSize: 500 }),
    listCustomerServiceAccountProfiles({ page: 1, pageSize: 500 }),
  ]);

  let store = storePage.items.find((item) => item.code === fixture.store.code) || null;
  const storePayload = {
    name: fixture.store.name,
    description: fixture.store.description,
    profile: fixture.store.profile,
    status: 'ENABLED' as const,
  };
  if (store) {
    store = await updateCustomerServiceStoreProfile(store.id, { ...storePayload, revision: store.revision });
  } else {
    store = await createCustomerServiceStoreProfile({ ...storePayload, code: fixture.store.code });
  }

  let account = accountPage.items.find((item) => item.code === fixture.account.code) || null;
  const accountPayload = {
    name: fixture.account.name,
    storeProfileId: store.id,
    merchantRoleId: role.id,
    industryNodeId: industry?.id || null,
    channel: fixture.account.channel as CustomerServiceAccountChannel,
    description: fixture.account.description,
    profile: fixture.account.profile,
    status: 'ENABLED' as const,
  };
  if (account) {
    account = await updateCustomerServiceAccountProfile(account.id, { ...accountPayload, revision: account.revision });
  } else {
    account = await createCustomerServiceAccountProfile({ ...accountPayload, code: fixture.account.code });
  }

  const collections = await listCustomerServiceKnowledgeCollections();
  let collection = collections.find((item) => item.code === fixture.collection.code) || null;
  const collectionPayload = {
    name: fixture.collection.name,
    code: fixture.collection.code,
    description: fixture.collection.description,
    // The collection must use the real runtime industry code selected for this account.
    // A fixture-only synthetic code (for example FASHION_APPAREL) is not guaranteed
    // to exist in CustomerServiceIndustryNode and would be rejected by the server's
    // business-scope coherence gate even when the ACCOUNT binding itself is valid.
    industryCode: industry?.code || null,
    status: 'ENABLED',
  };
  if (collection) {
    collection = await updateCustomerServiceKnowledgeCollection(collection.id, { ...collectionPayload, revision: collection.revision });
  } else {
    collection = await createCustomerServiceKnowledgeCollection(collectionPayload);
  }

  const currentEntries = (await listCustomerServiceKnowledgeEntries({
    scopeType: 'COLLECTION', scopeKey: collection.id, page: 1, pageSize: 500,
  })).items;
  const expectedEntries = fixture.entries as Array<Record<string, unknown>>;

  if (!currentEntries.length) {
    await batchImportCustomerServiceKnowledge({
      collectionId: collection.id,
      sourceFileName: 'hve-standard-qinghe-fashion.json',
      status: 'ENABLED',
      entries: expectedEntries,
    });
  } else {
    const currentByIdentity = new Map(currentEntries.map((item) => [entryIdentity(item as unknown as Record<string, unknown>), item]));
    for (const raw of expectedEntries) {
      const payload = toEntryPayload(collection.id, raw);
      const current = currentByIdentity.get(entryIdentity(raw));
      if (current) await updateCustomerServiceKnowledgeEntry(current.id, { ...payload, revision: current.revision });
      else await createCustomerServiceKnowledgeEntry(payload);
    }
  }

  const bindings = await listCustomerServiceKnowledgeBindings(collection.id);
  const accountBinding = bindings.find((item) => item.targetType === 'ACCOUNT' && item.targetKey === account!.id);
  if (!accountBinding || accountBinding.status !== 'ENABLED' || accountBinding.priority !== 220) {
    await upsertCustomerServiceKnowledgeBinding(collection.id, {
      targetType: 'ACCOUNT', targetKey: account.id, priority: 220, status: 'ENABLED',
    });
  }

  // Do not report the standard fixture as ready until the server can read back
  // the exact ACCOUNT binding that Runtime/preview will consume.  The previous
  // installer could leave account/store/entries persisted when the final binding
  // write failed, which made the UI look configured while Runtime had no knowledge.
  const verifiedBindings = await listCustomerServiceKnowledgeBindings(collection.id);
  const verifiedAccountBinding = verifiedBindings.find((item) => (
    item.targetType === 'ACCOUNT'
    && item.targetKey === account!.id
    && item.status === 'ENABLED'
  ));
  if (!verifiedAccountBinding) {
    throw new Error('HVE 标准店铺客服知识库未成功绑定当前测试账号，请重试“修复 HVE 标准店铺客服”');
  }

  return { account, store, collection, role, industry, binding: verifiedAccountBinding };
}


export async function repairHveStandardKnowledgeFixture(accountProfileId?: string) {
  const [accountPage, collections] = await Promise.all([
    listCustomerServiceAccountProfiles({ page: 1, pageSize: 500 }),
    listCustomerServiceKnowledgeCollections(),
  ]);
  const account = accountPage.items.find((item) => (
    item.code === fixture.account.code
    && (!accountProfileId || item.id === accountProfileId)
  ));
  if (!account) throw new Error('当前账号不是 HVE 标准测试账号，未执行测试 Fixture 修复');
  const collection = collections.find((item) => item.code === fixture.collection.code);
  if (!collection) throw new Error('未找到 HVE 标准测试知识库，请先安装标准测试 Fixture');

  const currentEntries = (await listCustomerServiceKnowledgeEntries({
    scopeType: 'COLLECTION', scopeKey: collection.id, page: 1, pageSize: 500,
  })).items;
  const currentByIdentity = new Map(currentEntries.map((item) => [entryIdentity(item as unknown as Record<string, unknown>), item]));
  const expectedEntries = fixture.entries as Array<Record<string, unknown>>;
  let created = 0;
  let updated = 0;
  for (const raw of expectedEntries) {
    const payload = toEntryPayload(collection.id, raw);
    const current = currentByIdentity.get(entryIdentity(raw));
    if (current) {
      await updateCustomerServiceKnowledgeEntry(current.id, { ...payload, revision: current.revision });
      updated += 1;
    } else {
      await createCustomerServiceKnowledgeEntry(payload);
      created += 1;
    }
  }

  const bindings = await listCustomerServiceKnowledgeBindings(collection.id);
  const accountBinding = bindings.find((item) => item.targetType === 'ACCOUNT' && item.targetKey === account.id);
  if (!accountBinding || accountBinding.status !== 'ENABLED' || accountBinding.priority !== 220) {
    await upsertCustomerServiceKnowledgeBinding(collection.id, {
      targetType: 'ACCOUNT', targetKey: account.id, priority: 220, status: 'ENABLED',
    });
  }
  return { accountId: account.id, collectionId: collection.id, created, updated, total: expectedEntries.length };
}
