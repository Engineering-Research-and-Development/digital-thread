-- Postgres-only optimisation for JSON fields.
-- Apply after `prisma migrate deploy` when DB_PROVIDER=postgres.
-- These indexes accelerate where-used queries across nodesJson/inputFileStatusesJson.

CREATE INDEX IF NOT EXISTS "StateMachine_nodesJson_gin" ON "StateMachine" USING GIN (("nodesJson"::jsonb));
CREATE INDEX IF NOT EXISTS "NodeRuntimeState_inputFileStatusesJson_gin" ON "NodeRuntimeState" USING GIN (("inputFileStatusesJson"::jsonb));
CREATE INDEX IF NOT EXISTS "Iteration_metadataJson_gin" ON "Iteration" USING GIN (("metadataJson"::jsonb));
CREATE INDEX IF NOT EXISTS "IngestRecord_payloadPreview_trgm" ON "IngestRecord" USING GIN ("payloadPreview" gin_trgm_ops);
