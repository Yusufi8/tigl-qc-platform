# Database migrations

Run `DATABASE_URL=postgres://... npm run db:migrate`. The runner orders SQL migrations, records SHA-256 checksums, serializes concurrent runs with a PostgreSQL advisory lock, and commits each migration transactionally. Applied files are immutable; create a new migration to change the schema. Rollback is forward-only: add a reviewed compensating migration, since dropping production QC records is unsafe. PostgreSQL 16 and `psql` are required.

`001_initial_schema.sql` applies the complete audited schema in `TIGL-QC-Dev-Packet/db/schema.sql`; `002_application_foundation.sql` adds sessions, append-only audit events, and initial roles and permissions.
