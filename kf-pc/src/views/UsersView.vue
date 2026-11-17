<template>
  <CrudPageShell>
    <template #summary>
      <SummaryCardsRow :items="summaryCards" :columns="4" />
    </template>

    <template #filters>
      <CrudFilterPanel title="用户筛选" description="筛选条件会实时联动列表和分页统计">
        <template #badges>
          <el-tag round effect="plain">当前 {{ filteredItems.length }} 人</el-tag>
          <el-tag round type="success" effect="plain">已缓存筛选状态</el-tag>
        </template>

        <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <el-form-item label="关键词" class="!mb-0">
            <el-input v-model="filters.keyword" placeholder="昵称 / 手机号 / 邮箱" clearable />
          </el-form-item>
          <el-form-item label="状态" class="!mb-0">
            <el-select v-model="filters.status" placeholder="全部状态" clearable>
              <el-option label="正常" value="正常" />
              <el-option label="冻结" value="冻结" />
              <el-option label="待验证" value="待验证" />
            </el-select>
          </el-form-item>
          <el-form-item label="会员等级" class="!mb-0">
            <el-select v-model="filters.level" placeholder="全部等级" clearable>
              <el-option v-for="level in userLevelOptions" :key="level" :label="level" :value="level" />
            </el-select>
          </el-form-item>
          <el-form-item label="注册来源" class="!mb-0">
            <el-select v-model="filters.source" placeholder="全部来源" clearable>
              <el-option label="官网注册" value="官网注册" />
              <el-option label="活动投放" value="活动投放" />
              <el-option label="渠道邀请" value="渠道邀请" />
            </el-select>
          </el-form-item>
        </el-form>

        <template #actions>
          <el-button type="primary">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </template>
      </CrudFilterPanel>
    </template>

    <template #table>
      <CrudTablePanel title="用户列表" description="查询区、表格区、分页区已抽成通用壳子，后续页面可以直接复用">
        <template #actions>
          <el-button>批量冻结</el-button>
          <el-button type="primary">新增用户</el-button>
        </template>

        <el-table :data="pagedItems" stripe row-key="phone">
          <el-table-column type="selection" width="55" />
          <el-table-column prop="name" label="用户" min-width="180">
            <template #default="{ row }">
              <div>
                <div class="font-medium">{{ row.name }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ row.email }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="手机号" min-width="150" />
          <el-table-column prop="level" label="等级" min-width="130" />
          <el-table-column prop="source" label="来源" min-width="130" />
          <el-table-column prop="status" label="状态" min-width="120">
            <template #default="{ row }">
              <el-tag :type="resolveStatusType(row.status)">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="updatedAt" label="更新时间" min-width="180" />
          <el-table-column label="操作" width="200" fixed="right">
            <template #default>
              <el-button link type="primary">详情</el-button>
              <el-button link>编辑</el-button>
              <el-button link type="danger">禁用</el-button>
            </template>
          </el-table-column>
        </el-table>

        <template #footer>
          <CrudPaginationBar
            :current-page="pagination.currentPage"
            :page-size="pagination.pageSize"
            :total="filteredItems.length"
            @update:current-page="pagination.currentPage = $event"
            @update:page-size="pagination.pageSize = $event"
          />
        </template>
      </CrudTablePanel>
    </template>
  </CrudPageShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CrudFilterPanel from '@/features/crud/components/CrudFilterPanel.vue';
import CrudPageShell from '@/features/crud/components/CrudPageShell.vue';
import CrudPaginationBar from '@/features/crud/components/CrudPaginationBar.vue';
import CrudTablePanel from '@/features/crud/components/CrudTablePanel.vue';
import SummaryCardsRow from '@/features/crud/components/SummaryCardsRow.vue';
import { useCrudPage } from '@/features/crud/composables/useCrudPage';
import { userLevelOptions, users } from '@/mock/users';

interface UserFilters {
  keyword: string;
  status: string;
  level: string;
  source: string;
}

defineOptions({ name: 'UsersView' });

const { filters, pagination, filteredItems, pagedItems, resetFilters } = useCrudPage({
  items: users,
  initialFilters: {
    keyword: '',
    status: '',
    level: '',
    source: ''
  } satisfies UserFilters,
  filterFn: (user, currentFilters) => {
    const keyword = currentFilters.keyword.trim().toLowerCase();
    const matchKeyword =
      !keyword || [user.name, user.phone, user.email].some((field) => field.toLowerCase().includes(keyword));

    return (
      matchKeyword &&
      (!currentFilters.status || user.status === currentFilters.status) &&
      (!currentFilters.level || user.level === currentFilters.level) &&
      (!currentFilters.source || user.source === currentFilters.source)
    );
  }
});

const summaryCards = computed(() => {
  const total = filteredItems.value.length;
  const active = filteredItems.value.filter((item) => item.status === '正常').length;
  const pending = filteredItems.value.filter((item) => item.status === '待验证').length;
  const vip = filteredItems.value.filter((item) => ['黄金会员', '钻石会员', '黑金会员'].includes(item.level)).length;

  return [
    { label: '筛选结果', value: `${total}`, tip: '根据当前条件实时计算' },
    { label: '正常用户', value: `${active}`, tip: '可正常访问业务功能' },
    { label: '待验证', value: `${pending}`, tip: '建议尽快完成资料校验' },
    { label: '高价值会员', value: `${vip}`, tip: '黄金及以上等级用户' }
  ];
});

function resolveStatusType(status: string): 'success' | 'warning' | 'danger' {
  if (status === '正常') return 'success';
  if (status === '冻结') return 'danger';
  return 'warning';
}
</script>
