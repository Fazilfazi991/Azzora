-- REVIEW ONLY; DO NOT RUN without confirming the exact staging project in the dashboard.
-- This removes only the candidate RPC, never records, users, other functions or keys.
-- It deliberately fails if the current function differs from the reviewed candidate.
begin;
do $$
declare fn pg_catalog.pg_proc; actual text;
begin
  perform azzora.assert_synthetic_staging();
  select * into fn from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('public.staging_owner_backup(text)');
  if not found or not fn.prosecdef or fn.provolatile <> 's' or fn.proconfig is distinct from array['search_path=""']::text[] or fn.proowner <> (select oid from pg_catalog.pg_roles where rolname=current_user) then
    raise exception 'Rollback refused: function identity, owner or security mode differs';
  end if;
  actual:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(fn.prosrc, E'\r\n', E'\n'), 'UTF8')), 'hex');
  if actual <> '7564fd6b0e0062c9ea2c84271133add3296bba68b71441185880f854d71dc941' then
    raise exception 'Rollback refused: function body differs';
  end if;
  if pg_catalog.has_function_privilege('anon', fn.oid, 'execute') or pg_catalog.has_function_privilege('authenticated', fn.oid, 'execute') or not pg_catalog.has_function_privilege('service_role', fn.oid, 'execute') then
    raise exception 'Rollback refused: function ACL differs';
  end if;
  if (select count(*) from pg_catalog.aclexplode(fn.proacl)) <> 2 or exists (
    select 1 from pg_catalog.aclexplode(fn.proacl) acl
    where acl.privilege_type <> 'EXECUTE' or acl.is_grantable or acl.grantor <> fn.proowner
       or acl.grantee not in (fn.proowner, (select oid from pg_catalog.pg_roles where rolname='service_role'))
  ) then
    raise exception 'Rollback refused: unexpected function grant';
  end if;
end $$;
revoke execute on function public.staging_owner_backup(text) from service_role;
drop function public.staging_owner_backup(text);
commit;
