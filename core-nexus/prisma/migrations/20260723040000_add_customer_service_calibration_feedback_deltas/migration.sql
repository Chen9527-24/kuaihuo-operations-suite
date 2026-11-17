ALTER TABLE "CustomerServiceCalibrationRecord"
  ADD COLUMN "requestedDeltas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "CustomerServiceCalibrationRecord_requestedDeltas_idx"
  ON "CustomerServiceCalibrationRecord" USING GIN ("requestedDeltas");
