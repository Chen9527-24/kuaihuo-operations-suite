CREATE TABLE "InterceptIntentAnalysisBatch" (
  "id" TEXT NOT NULL,
  "batchNo" VARCHAR(64) NOT NULL,
  "tenantId" VARCHAR(64) NOT NULL,
  "robotId" VARCHAR(64) NOT NULL,
  "runId" VARCHAR(64),
  "workflowId" VARCHAR(128) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "totalCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "batchSize" INTEGER NOT NULL DEFAULT 30,
  "errorMessage" TEXT,
  "requestContext" JSONB,
  "createdBy" VARCHAR(64),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(6),
  CONSTRAINT "InterceptIntentAnalysisBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterceptIntentAnalysisChunk" (
  "id" TEXT NOT NULL,
  "analysisBatchId" VARCHAR(64) NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "captureIds" JSONB NOT NULL,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "executeId" VARCHAR(128),
  "logId" VARCHAR(128),
  "errorMessage" TEXT,
  "requestPayload" JSONB,
  "responseRaw" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(6),
  CONSTRAINT "InterceptIntentAnalysisChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InterceptIntentAnalysisBatch_batchNo_key" ON "InterceptIntentAnalysisBatch"("batchNo");
CREATE INDEX "InterceptIntentAnalysisBatch_tenantId_createdAt_idx" ON "InterceptIntentAnalysisBatch"("tenantId", "createdAt");
CREATE INDEX "InterceptIntentAnalysisBatch_robotId_createdAt_idx" ON "InterceptIntentAnalysisBatch"("robotId", "createdAt");
CREATE INDEX "InterceptIntentAnalysisBatch_status_idx" ON "InterceptIntentAnalysisBatch"("status");

CREATE UNIQUE INDEX "InterceptIntentAnalysisChunk_analysisBatchId_chunkIndex_key" ON "InterceptIntentAnalysisChunk"("analysisBatchId", "chunkIndex");
CREATE INDEX "InterceptIntentAnalysisChunk_analysisBatchId_status_idx" ON "InterceptIntentAnalysisChunk"("analysisBatchId", "status");
ALTER TABLE "InterceptIntentAnalysisChunk" ADD CONSTRAINT "InterceptIntentAnalysisChunk_analysisBatchId_fkey" FOREIGN KEY ("analysisBatchId") REFERENCES "InterceptIntentAnalysisBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
