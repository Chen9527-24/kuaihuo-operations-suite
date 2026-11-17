import { request } from '@/api/core/http';
import { isRecord, normalizePageResult, pickString, unwrapData, type PageResult } from '@/utils/apiData';

export interface CommentRecordQuery {
  tenantId?: string;
  robotId?: string;
  platform?: string;
  botNickname?: string;
  postTitle?: string;
  videoId?: string;
  rootRecordId?: string;
  senderRole?: string;
  collectionStatus?: string;
  replyStatus?: string;
  keyword?: string;
  startAt?: string;
  endAt?: string;
  page?: number;
  pageSize?: number;
}

export interface CommentThreadItem {
  rootRecordId: string;
  rootRecordIds: string[];
  mergedSegmentCount: number;
  platform: string;
  robotId: string;
  botNickname: string;
  videoId: string;
  videoTitle: string;
  rootAuthor: string;
  rootContent: string;
  rootCommentTime?: string;
  firstObservedAt?: string;
  lastActivityAt?: string;
  messageCount: number;
  rawMessageCount: number;
  duplicateCount: number;
  userCommentCount: number;
  accountReplyCount: number;
  followUpCount: number;
  replyStatus: string;
  shouldReplyCount: number;
  failedCount: number;
  collectionStatus: string;
  threadCompleteness: string;
  repliesCollapsed: boolean;
  currentFilter: string;
  commenterCount: number;
}

export interface CommentMessageItem {
  recordId: string;
  externalCommentId: string;
  platform: string;
  robotId: string;
  botNickname: string;
  postTitle: string;
  videoId: string;
  videoTitle: string;
  rootRecordId: string;
  parentRecordId: string;
  depth: number;
  senderRole: string;
  actorSource: string;
  attributionConfidence: string;
  replyAttemptId: string;
  replyTraceId: string;
  generationSource: string;
  userNickname: string;
  commentContent: string;
  messageType: string;
  typePlaceholder: string;
  commentTime?: string;
  sourceTimeRaw: string;
  observedAt?: string;
  timeAccuracy: string;
  collectionStatus: string;
  currentFilter: string;
  repliesCollapsed: boolean;
  threadCompleteness: string;
  sourceClientId: string;
  shouldReply: boolean;
  skipReply: boolean;
  skipReason: string;
  commentType: string;
  intentLevel: string;
  intentLabel: string;
  judgeReason: string;
  replyStatus: string;
  replyContent: string;
  replyTime?: string;
  failReason: string;
  createdAt?: string;
  updatedAt?: string;
  evidenceLevel: string;
  feedbackMode: string;
  feedbackReason: string;
  sourceLabel: string;
  mediaLabel: string;
  isMediaMessage: boolean;
}

export interface CommentSummary {
  threadCount: number;
  messageCount: number;
  rawMessageCount: number;
  duplicateCount: number;
  rawMessageCount: number;
  duplicateCount: number;
  userCommentCount: number;
  accountReplyCount: number;
  topLevelCount: number;
  followUpCount: number;
  repliedThreadCount: number;
  unrepliedThreadCount: number;
  failedCount: number;
  notRequiredCount: number;
  incompleteThreadCount: number;
  videoCount: number;
  commenterCount: number;
}

export async function listCommentThreads(query: CommentRecordQuery): Promise<PageResult<CommentThreadItem>> {
  const payload = await request<unknown>({ path: '/auto-replies/comment/records/threads', query });
  const page = normalizePageResult<unknown>(payload);
  return { ...page, items: page.items.map(normalizeThread) };
}

export async function getCommentSummary(query: CommentRecordQuery): Promise<CommentSummary> {
  const payload = unwrapData(await request<unknown>({ path: '/auto-replies/comment/records/summary', query }));
  const row = isRecord(payload) ? payload : {};
  return {
    threadCount: Number(row.thread_count || 0),
    messageCount: Number(row.message_count || 0),
    rawMessageCount: Number(row.raw_message_count || row.message_count || 0),
    duplicateCount: Number(row.duplicate_count || 0),
    userCommentCount: Number(row.user_comment_count || 0),
    accountReplyCount: Number(row.account_reply_count || 0),
    topLevelCount: Number(row.top_level_count || 0),
    followUpCount: Number(row.follow_up_count || 0),
    repliedThreadCount: Number(row.replied_thread_count || 0),
    unrepliedThreadCount: Number(row.unreplied_thread_count || 0),
    failedCount: Number(row.failed_count || 0),
    notRequiredCount: Number(row.not_required_count || 0),
    incompleteThreadCount: Number(row.incomplete_thread_count || 0),
    videoCount: Number(row.video_count || 0),
    commenterCount: Number(row.commenter_count || 0)
  };
}

export async function getCommentThread(rootRecordId: string, query: CommentRecordQuery = {}) {
  const payload = unwrapData(await request<unknown>({
    path: `/auto-replies/comment/records/thread/${encodeURIComponent(rootRecordId)}`,
    query
  }));
  const row = isRecord(payload) ? payload : {};
  const messages = Array.isArray(row.messages) ? row.messages.map(normalizeMessage) : [];
  return {
    thread: row.thread ? normalizeThread(row.thread) : null,
    messages
  };
}


export async function deleteCommentThread(rootRecordId: string, query: CommentRecordQuery = {}) {
  return unwrapData(await request<unknown>({
    path: `/auto-replies/comment/records/thread/${encodeURIComponent(rootRecordId)}`,
    method: 'DELETE',
    query
  }));
}

function normalizeThread(payload: unknown): CommentThreadItem {
  const value = unwrapData(payload);
  const row = isRecord(value) ? value : {};
  return {
    rootRecordId: pickString(row, ['root_record_id']),
    rootRecordIds: Array.isArray(row.root_record_ids) ? row.root_record_ids.map((item) => String(item)) : [],
    mergedSegmentCount: Number(row.merged_segment_count || 1),
    platform: pickString(row, ['platform']),
    robotId: pickString(row, ['robot_id']),
    botNickname: pickString(row, ['bot_nickname']),
    videoId: pickString(row, ['video_id']),
    videoTitle: pickString(row, ['video_title']),
    rootAuthor: pickString(row, ['root_author']),
    rootContent: pickString(row, ['root_content']),
    rootCommentTime: pickString(row, ['root_comment_time']),
    firstObservedAt: pickString(row, ['first_observed_at']),
    lastActivityAt: pickString(row, ['last_activity_at']),
    messageCount: Number(row.message_count || 0),
    rawMessageCount: Number(row.raw_message_count || row.message_count || 0),
    duplicateCount: Number(row.duplicate_count || 0),
    userCommentCount: Number(row.user_comment_count || 0),
    accountReplyCount: Number(row.account_reply_count || 0),
    followUpCount: Number(row.follow_up_count || 0),
    replyStatus: pickString(row, ['reply_status']),
    shouldReplyCount: Number(row.should_reply_count || 0),
    failedCount: Number(row.failed_count || 0),
    collectionStatus: pickString(row, ['collection_status']),
    threadCompleteness: pickString(row, ['thread_completeness']),
    repliesCollapsed: Boolean(row.replies_collapsed),
    currentFilter: pickString(row, ['current_filter']),
    commenterCount: Number(row.commenter_count || 0)
  };
}

function normalizeMessage(payload: unknown): CommentMessageItem {
  const value = unwrapData(payload);
  const row = isRecord(value) ? value : {};
  return {
    recordId: pickString(row, ['record_id']),
    externalCommentId: pickString(row, ['external_comment_id']),
    platform: pickString(row, ['platform']),
    robotId: pickString(row, ['robot_id']),
    botNickname: pickString(row, ['bot_nickname']),
    postTitle: pickString(row, ['post_title']),
    videoId: pickString(row, ['video_id']),
    videoTitle: pickString(row, ['video_title']),
    rootRecordId: pickString(row, ['root_record_id']),
    parentRecordId: pickString(row, ['parent_record_id']),
    depth: Number(row.depth || 0),
    senderRole: pickString(row, ['sender_role']) || 'user',
    actorSource: pickString(row, ['actor_source']),
    attributionConfidence: pickString(row, ['attribution_confidence']),
    replyAttemptId: pickString(row, ['reply_attempt_id']),
    replyTraceId: pickString(row, ['reply_trace_id']),
    generationSource: pickString(row, ['generation_source']),
    userNickname: pickString(row, ['user_nickname']),
    commentContent: pickString(row, ['comment_content']),
    messageType: pickString(row, ['message_type']) || 'text',
    typePlaceholder: pickString(row, ['type_placeholder']),
    commentTime: pickString(row, ['comment_time']),
    sourceTimeRaw: pickString(row, ['source_time_raw']),
    observedAt: pickString(row, ['observed_at']),
    timeAccuracy: pickString(row, ['time_accuracy']),
    collectionStatus: pickString(row, ['collection_status']),
    currentFilter: pickString(row, ['current_filter']),
    repliesCollapsed: Boolean(row.replies_collapsed),
    threadCompleteness: pickString(row, ['thread_completeness']),
    sourceClientId: pickString(row, ['source_client_id']),
    shouldReply: Boolean(row.should_reply),
    skipReply: Boolean(row.skip_reply),
    skipReason: pickString(row, ['skip_reason']),
    commentType: pickString(row, ['comment_type']),
    intentLevel: pickString(row, ['intent_level']),
    intentLabel: pickString(row, ['intent_label']),
    judgeReason: pickString(row, ['judge_reason']),
    replyStatus: pickString(row, ['reply_status']),
    replyContent: pickString(row, ['reply_content']),
    replyTime: pickString(row, ['reply_time']),
    failReason: pickString(row, ['fail_reason']),
    createdAt: pickString(row, ['created_at']),
    updatedAt: pickString(row, ['updated_at']),
    evidenceLevel: pickString(row, ['evidence_level']),
    feedbackMode: pickString(row, ['feedback_mode']),
    feedbackReason: pickString(row, ['feedback_reason']),
    sourceLabel: pickString(row, ['source_label']),
    mediaLabel: pickString(row, ['media_label']),
    isMediaMessage: Boolean(row.is_media_message)
  };
}
