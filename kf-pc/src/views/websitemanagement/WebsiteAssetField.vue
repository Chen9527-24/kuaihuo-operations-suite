<template>
  <div class="asset-field">
    <div class="asset-media">
      <el-upload
        v-if="canUpload"
        class="asset-uploader"
        :show-file-list="false"
        :http-request="handleUpload"
        :before-upload="beforeUpload"
        accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico"
      >
        <div class="asset-preview" :class="{ 'has-image': previewUrl }">
          <img v-if="previewUrl" :src="previewUrl" alt="官网素材预览" />
          <div v-else class="asset-empty">
            <span class="asset-plus">+</span>
            <strong>上传图片</strong>
          </div>
          <span class="asset-preview-mask">{{ previewUrl ? '点击替换' : '选择文件' }}</span>
        </div>
      </el-upload>
      <div v-else class="asset-preview readonly" :class="{ 'has-image': previewUrl }">
        <img v-if="previewUrl" :src="previewUrl" alt="官网素材预览" />
        <div v-else class="asset-empty"><strong>未配置</strong></div>
      </div>
    </div>

    <div class="asset-detail">
      <div class="asset-heading">
        <div>
          <div class="asset-title-row">
            <strong>{{ previewUrl ? '已配置素材' : '素材地址' }}</strong>
            <span v-if="hasDefault" class="asset-state-tag" :class="isDefault ? 'is-default' : 'is-custom'">{{ assetStateLabel }}</span>
          </div>
          <span>{{ previewUrl ? '当前图片会在保存并发布后用于官网' : '可上传图片，也可以直接填写素材地址' }}</span>
        </div>
        <div class="asset-actions">
          <el-button v-if="canEdit && hasDefault && !isDefault" link type="primary" @click="restoreDefault">恢复默认素材</el-button>
          <el-button v-if="canEdit && modelValue" link type="danger" @click="clearAsset">清除</el-button>
        </div>
      </div>

      <el-input
        class="asset-url-input"
        :model-value="modelValue"
        :disabled="!canEdit"
        placeholder="https://、/uploads/ 或项目内素材路径"
        @update:model-value="$emit('update:modelValue', $event)"
      />

      <div class="asset-meta">
        <small>JPEG / PNG / WebP / ICO</small>
        <small>单文件 ≤ 5MB</small>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import * as websiteApi from '@/api/modules/website';
import { resolveAssetUrl } from '@/utils/format';

const props = defineProps<{ modelValue: string; canEdit: boolean; canUpload: boolean; defaultValue?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const previewUrl = computed(() => resolveAssetUrl(props.modelValue));
const hasDefault = computed(() => props.defaultValue !== undefined);
const isDefault = computed(() => hasDefault.value && props.modelValue === props.defaultValue);
const assetStateLabel = computed(() => {
  if (!hasDefault.value) return '';
  if (isDefault.value) return props.defaultValue ? '默认素材' : '默认未配置';
  return props.modelValue ? '已替换' : '已清除';
});

function beforeUpload(file: File) {
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.warning('官网图片不能超过 5MB');
    return false;
  }
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/ico'];
  if (!allowed.includes(file.type) && !file.name.toLowerCase().endsWith('.ico')) {
    ElMessage.warning('仅支持 JPEG、PNG、WebP 或 ICO 图片');
    return false;
  }
  return true;
}

async function handleUpload(options: unknown) {
  const file = (options as { file?: File }).file;
  if (!file) return;
  const result = await websiteApi.uploadWebsiteAsset(file);
  emit('update:modelValue', result.fullUrl || result.url || '');
  ElMessage.success('官网素材上传成功，请保存草稿后再发布');
}

function restoreDefault() {
  if (!hasDefault.value || isDefault.value) return;
  emit('update:modelValue', props.defaultValue ?? '');
  ElMessage.success('已恢复默认素材，请保存草稿后再发布');
}

function clearAsset() {
  emit('update:modelValue', '');
}
</script>

<style scoped>
.asset-field {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr);
  align-items: stretch;
  gap: 14px;
  width: 100%;
  min-width: 0;
  padding: 13px;
  border: 1px solid #e6ebf0;
  border-radius: 12px;
  background: #fafbfc;
}

.asset-media { display: flex; align-items: center; }
.asset-uploader { display: block; width: 100%; }
.asset-uploader :deep(.el-upload) { display: block; width: 100%; }
.asset-preview {
  position: relative;
  display: flex;
  width: 104px;
  height: 96px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px dashed #cfd8e3;
  border-radius: 10px;
  background: #f4f7fa;
  color: #7c8999;
  cursor: pointer;
  transition: border-color .16s ease, box-shadow .16s ease, background-color .16s ease;
}
.asset-preview:hover { border-color: #79b895; background: #f2faf5; box-shadow: 0 0 0 3px rgba(16, 166, 90, .07); }
.asset-preview.readonly { cursor: default; }
.asset-preview.readonly:hover { border-color: #cfd8e3; background: #f4f7fa; box-shadow: none; }
.asset-preview img { width: 100%; height: 100%; padding: 8px; object-fit: contain; }
.asset-empty { display: grid; place-items: center; gap: 6px; font-size: 11px; }
.asset-empty strong { color: #6c7889; font-size: 11px; font-weight: 650; }
.asset-plus { display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid #c8d5df; border-radius: 50%; background: #fff; color: #16864c; font-size: 18px; line-height: 1; }
.asset-preview-mask { position: absolute; right: 0; bottom: 0; left: 0; padding: 5px 6px; transform: translateY(100%); background: rgba(31, 41, 55, .75); color: #fff; font-size: 9.5px; text-align: center; transition: transform .16s ease; }
.asset-preview:hover .asset-preview-mask { transform: translateY(0); }
.asset-preview.readonly .asset-preview-mask { display: none; }

.asset-detail { display: flex; min-width: 0; flex-direction: column; justify-content: center; gap: 9px; }
.asset-heading { display: flex; min-width: 0; align-items: flex-start; justify-content: space-between; gap: 10px; }
.asset-heading > div:first-child { display: grid; min-width: 0; gap: 3px; }
.asset-title-row { display: flex; min-width: 0; align-items: center; gap: 7px; }
.asset-heading strong { color: #445164; font-size: 11.5px; font-weight: 700; }
.asset-heading > div:first-child > span { overflow: hidden; color: #939eac; font-size: 9.5px; text-overflow: ellipsis; white-space: nowrap; }
.asset-state-tag { flex: 0 0 auto; padding: 2px 6px; border-radius: 999px; font-size: 9px; font-weight: 700; line-height: 1.4; }
.asset-state-tag.is-default { background: #eaf8f0; color: #0d8f4d; }
.asset-state-tag.is-custom { background: #fff4df; color: #a56a11; }
.asset-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; }
.asset-heading :deep(.el-button) { min-height: auto; height: auto; margin-left: 0; padding: 0; font-size: 10px; }
.asset-url-input { min-width: 0; }
.asset-meta { display: flex; flex-wrap: wrap; gap: 5px 12px; color: #9aa4b1; }
.asset-meta small { font-size: 9.5px; line-height: 1.4; }

@media (max-width: 720px) {
  .asset-field { grid-template-columns: 1fr; }
  .asset-preview { width: 100%; height: 126px; }
  .asset-heading > div:first-child > span { white-space: normal; }
  .asset-heading { gap: 8px; }
  .asset-actions { flex-wrap: wrap; justify-content: flex-end; }
}
</style>
