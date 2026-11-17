<template>
  <CrudPageShell>
    <template #summary>
      <SummaryCardsRow :items="orderStats" :columns="3" />
    </template>

    <template #filters>
      <CrudFilterPanel title="订单筛选" description="筛选条件会同步影响统计卡片、表格和分页">
        <template #badges>
          <el-tag round effect="plain">命中 {{ filteredItems.length }} 条</el-tag>
        </template>

        <el-form :model="filters" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <el-form-item label="关键词" class="!mb-0">
            <el-input v-model="filters.keyword" placeholder="订单号 / 用户名" clearable />
          </el-form-item>
          <el-form-item label="支付状态" class="!mb-0">
            <el-select v-model="filters.status" placeholder="全部状态" clearable>
              <el-option label="已支付" value="已支付" />
              <el-option label="待支付" value="待支付" />
              <el-option label="退款中" value="退款中" />
            </el-select>
          </el-form-item>
          <el-form-item label="支付渠道" class="!mb-0">
            <el-select v-model="filters.channel" placeholder="全部渠道" clearable>
              <el-option v-for="channel in orderChannelOptions" :key="channel" :label="channel" :value="channel" />
            </el-select>
          </el-form-item>
          <el-form-item label="业务来源" class="!mb-0">
            <el-select v-model="filters.business" placeholder="全部业务" clearable>
              <el-option label="会员订阅" value="会员订阅" />
              <el-option label="活动报名" value="活动报名" />
              <el-option label="企业采购" value="企业采购" />
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
      <CrudTablePanel title="订单列表" description="通用表格壳子已经接入，后续新增订单类页面只要替换列定义和数据源即可">
        <template #actions>
          <el-button>导出明细</el-button>
          <el-button type="primary">新建订单</el-button>
        </template>

        <el-table :data="pagedItems" stripe row-key="id">
          <el-table-column prop="id" label="订单号" min-width="180" />
          <el-table-column prop="user" label="用户" min-width="120" />
          <el-table-column prop="amount" label="金额" min-width="120">
            <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="channel" label="支付渠道" min-width="120" />
          <el-table-column prop="business" label="业务来源" min-width="120" />
          <el-table-column prop="status" label="状态" min-width="120">
            <template #default="{ row }">
              <el-tag :type="resolveStatusType(row.status)">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="下单时间" min-width="180" />
          <el-table-column label="操作" width="180" fixed="right">
            <template #default>
              <el-button link type="primary">详情</el-button>
              <el-button link>备注</el-button>
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
import { orderChannelOptions, orders } from '@/mock/orders';

interface OrderFilters {
  keyword: string;
  status: string;
  channel: string;
  business: string;
}

defineOptions({ name: 'OrdersView' });

const { filters, pagination, filteredItems, pagedItems, resetFilters } = useCrudPage({
  items: orders,
  initialFilters: {
    keyword: '',
    status: '',
    channel: '',
    business: ''
  } satisfies OrderFilters,
  filterFn: (order, currentFilters) => {
    const keyword = currentFilters.keyword.trim().toLowerCase();
    const matchKeyword = !keyword || [order.id, order.user].some((field) => field.toLowerCase().includes(keyword));

    return (
      matchKeyword &&
      (!currentFilters.status || order.status === currentFilters.status) &&
      (!currentFilters.channel || order.channel === currentFilters.channel) &&
      (!currentFilters.business || order.business === currentFilters.business)
    );
  }
});

const orderStats = computed(() => {
  const totalAmount = filteredItems.value.reduce((sum, item) => sum + item.amount, 0);
  const refundCount = filteredItems.value.filter((item) => item.status === '退款中').length;
  const paidCount = filteredItems.value.filter((item) => item.status === '已支付').length;
  const successRate = filteredItems.value.length ? `${((paidCount / filteredItems.value.length) * 100).toFixed(1)}%` : '0%';

  return [
    { label: '支付金额', value: formatCurrency(totalAmount), tip: '基于当前筛选结果汇总' },
    { label: '退款中订单', value: `${refundCount}`, tip: '需要售后跟进处理' },
    { label: '支付成功率', value: successRate, tip: '已支付订单占比' }
  ];
});

function formatCurrency(amount: number) {
  return `¥ ${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function resolveStatusType(status: string): 'success' | 'warning' | 'danger' {
  if (status === '已支付') return 'success';
  if (status === '退款中') return 'danger';
  return 'warning';
}
</script>
