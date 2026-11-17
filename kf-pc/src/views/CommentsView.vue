<template>
  <CrudPageShell>
    <template #summary>
      <SummaryCardsRow :items="stats" :columns="3" />
    </template>

    <template #filters>
      <CrudFilterPanel title="评论筛选" description="切换分组、关键词和状态后，表格与分页会立即联动">
        <template #badges>
          <el-tag round effect="plain">当前 {{ filteredItems.length }} 条</el-tag>
        </template>

        <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr_1fr_auto]">
          <div>
            <div class="mb-2 text-sm font-medium">队列分组</div>
            <el-segmented v-model="filters.tab" :options="commentTabs" />
          </div>
          <el-form-item label="来源渠道" class="!mb-0">
            <el-select v-model="filters.source" placeholder="全部来源" clearable>
              <el-option v-for="source in commentSourceOptions" :key="source" :label="source" :value="source" />
            </el-select>
          </el-form-item>
          <el-form-item label="处理状态" class="!mb-0">
            <el-select v-model="filters.status" placeholder="全部状态" clearable>
              <el-option label="待处理" value="待处理" />
              <el-option label="已处理" value="已处理" />
            </el-select>
          </el-form-item>
          <el-form-item label="关键词" class="!mb-0">
            <el-input v-model="filters.keyword" placeholder="评论内容 / 用户昵称" clearable class="min-w-[220px]" />
          </el-form-item>
        </div>

        <template #actions>
          <el-button type="primary">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </template>
      </CrudFilterPanel>
    </template>

    <template #table>
      <CrudTablePanel title="评论列表" description="当前页状态会被 keep-alive 记住，切换回来仍保留筛选和分页位置">
        <el-table :data="pagedItems" stripe>
          <el-table-column prop="content" label="评论内容" min-width="320" />
          <el-table-column prop="author" label="用户" min-width="120" />
          <el-table-column prop="source" label="来源" min-width="120" />
          <el-table-column prop="status" label="状态" min-width="120">
            <template #default="{ row }">
              <el-tag :type="row.status === '待处理' ? 'warning' : 'success'">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="时间" min-width="180" />
          <el-table-column label="操作" width="180" fixed="right">
            <template #default>
              <el-button link type="primary">通过</el-button>
              <el-button link type="danger">驳回</el-button>
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
import { comments, commentSourceOptions, commentTabs } from '@/mock/comments';

interface CommentFilters {
  tab: string;
  keyword: string;
  source: string;
  status: string;
}

defineOptions({ name: 'CommentsView' });

const { filters, pagination, filteredItems, pagedItems, resetFilters } = useCrudPage({
  items: comments,
  initialFilters: {
    tab: '高意向评论',
    keyword: '',
    source: '',
    status: ''
  } satisfies CommentFilters,
  filterFn: (comment, currentFilters) => {
    const keyword = currentFilters.keyword.trim().toLowerCase();
    const matchKeyword =
      !keyword || [comment.content, comment.author].some((field) => field.toLowerCase().includes(keyword));

    return (
      comment.tab === currentFilters.tab &&
      matchKeyword &&
      (!currentFilters.source || comment.source === currentFilters.source) &&
      (!currentFilters.status || comment.status === currentFilters.status)
    );
  }
});

const stats = computed(() => {
  const pending = filteredItems.value.filter((item) => item.status === '待处理').length;
  const processed = filteredItems.value.filter((item) => item.status === '已处理').length;
  const privateLeads = filteredItems.value.filter((item) => item.source === '私信线索').length;

  return [
    { label: '待处理评论', value: `${pending}`, tip: '优先跟进高意向线索' },
    { label: '已处理评论', value: `${processed}`, tip: '已完成审核或转任务' },
    { label: '私信线索', value: `${privateLeads}`, tip: '更适合销售直接跟进' }
  ];
});
</script>
