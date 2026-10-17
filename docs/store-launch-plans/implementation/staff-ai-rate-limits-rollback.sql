-- Owner only. Stop AI requests safely; keep STAFF_AI_RATE_LIMIT_ENABLED=true.
-- Keep the auth guards and patched Next.js installed. Do not restore anonymous AI routes.
-- No counter deletion or change to financial/store tables.
begin;
revoke execute on function public.staff_ai_take_request_budget(uuid,text) from service_role;
commit;
