
## Integration and deployment handover

Private library uses caller JWT, not service-role access. Client requires getUser before
upload, registers a generated owner/document path, validates PDF MIME/name/size, uploads
without upsert, then invokes document-processor. Processor authenticates, checks ownership,
claims a lease, downloads privately, validates PDF signature, bounds text/pages/chunks,
and persists through token-checked completion. Failures use fixed codes; no OCR/fake text.
List/process/search/delete foundation exists, but there is no Documents UI or AI-grounded
private-library chat integration. Signed document URLs are not needed by this path.
Storage-first deletion/status allows retry but is not a transaction or durable janitor.

Browser/server clients use the public key; server/middleware getUser checks and session
cookie refresh require real Auth testing. Callback redirects are sanitized to local paths.
Configure Auth site URL for local test origin and exact callback/reset-password URLs;
prepare two confirmed test users. Do not use production accounts or service-role test reads.
Review all API/Edge access checks separately from CORS; Origin headers are not identity.

After a reviewed successful dry run AND migration approval, validate table grants/RLS and
the private documents bucket (10 MiB, application/pdf). Then review document-processor and
all shared dependencies, configure explicit ALLOWED_ORIGINS and normal JWT verification.
Only with separate deployment authorization use:

```powershell
supabase functions deploy document-processor --workdir "D:\AARAGATE" --project-ref $env:SUPABASE_PROJECT_REF
```

Do not use --no-verify-jwt. Hosted runtime supplies SUPABASE_URL and SUPABASE_ANON_KEY;
ingestion needs no AI key. Existing AI consumers need server-only provider configuration.
Legacy shared-chat attachment context is not safe to reuse for private library retrieval.
Untrusted document text must remain separate from system instructions when AI integration
is later implemented; no private document content should enter shared-room messages/logs.

No production-readiness claim: open high-severity legacy access/view findings, processing
provenance, quotas, cleanup races, live isolation and browser failures must be addressed.
Local recovery: revert only this session's hunks, preserving previous user modifications.
Remote recovery after future approved application: inspect history, backup and fix forward;
do not reset, delete user data, or replay historical migrations blindly.
