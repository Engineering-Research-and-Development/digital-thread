-- Postgres-only JSON/text search indexes — optional optimisation.
-- Accelerates where-used queries over the String-stored JSON blobs and the
-- ingest payload preview. Safe to (re)apply: every statement is IF NOT EXISTS.
-- Apply with `npm run db:indexes:postgres` (after db push). No-op on SQLite.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "StateMachine_nodesJson_gin" ON "StateMachine" USING GIN (("nodesJson"::jsonb));
CREATE INDEX IF NOT EXISTS "NodeRuntimeState_inputFileStatusesJson_gin" ON "NodeRuntimeState" USING GIN (("inputFileStatusesJson"::jsonb));
CREATE INDEX IF NOT EXISTS "Iteration_metadataJson_gin" ON "Iteration" USING GIN (("metadataJson"::jsonb));
CREATE INDEX IF NOT EXISTS "IngestRecord_payloadPreview_trgm" ON "IngestRecord" USING GIN ("payloadPreview" gin_trgm_ops);
