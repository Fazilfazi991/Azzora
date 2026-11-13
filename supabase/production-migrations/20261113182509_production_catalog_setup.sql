-- Existing company setup only: finite structural Chart of Accounts creation.
-- No grants, memberships, policies, posting flags, balances or periods change.
begin;
create function azzora.catalog_nonaccount_projection(p_data jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text; normalized jsonb; result jsonb:='{}'::jsonb;
begin
 foreach k in array array['parties','projects','departments','records','periods','journals','snapshots'] loop
  if jsonb_typeof(p_data->k) is distinct from 'array' then raise exception 'Complete canonical data required' using errcode='PT403';end if;
  select coalesce(jsonb_agg(value order by value::text),'[]'::jsonb) into normalized from jsonb_array_elements(p_data->k);
  result:=result||jsonb_build_object(k,normalized);
 end loop;
 return result;
end $$;
revoke all on function azzora.catalog_nonaccount_projection(jsonb) from public,anon,authenticated,service_role,azzora_api;
do $$
declare definition text; marker text:=' -- Financial activation is intentionally absent from this candidate; metadata cannot bypass the gate.';
begin
 definition:=pg_get_functiondef('public.azzora_production_company_commit(text,bigint,text,text,text,jsonb,jsonb,boolean)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'Reviewed production commit guard changed';end if;
 definition:=replace(definition,marker,$guard$
 -- A chart setup action can append exactly one validated account and nothing else.
 if p_scope ? 'catalogAction' then
  declare old_catalog jsonb; new_account jsonb;
  begin
   if p_scope->>'catalogAction'<>'create-ledger-account' or p_command<>'accounts.action' or p_bootstrap
    or a->>'workspace'<>'accountant' or a->>'role' not in ('owner_admin','accountant')
    or not(a->'capabilities' ? 'finance.draft') or coalesce((p_scope->>'financial')::boolean,true)
   then raise exception 'Account catalog setup denied' using errcode='PT403';end if;
   old_catalog:=azzora.production_canonical_data(c);
   if azzora.catalog_nonaccount_projection(p_data) is distinct from azzora.catalog_nonaccount_projection(old_catalog)
    or jsonb_typeof(p_data->'accounts') is distinct from 'array'
    or jsonb_array_length(p_data->'accounts')<>jsonb_array_length(old_catalog->'accounts')+1
    or jsonb_array_length(p_data->'accounts')>1000
    or exists(select 1 from jsonb_array_elements(old_catalog->'accounts') old where not exists(select 1 from jsonb_array_elements(p_data->'accounts') candidate where candidate=old))
    or (select count(distinct x->>'id') from jsonb_array_elements(p_data->'accounts') x)<>jsonb_array_length(p_data->'accounts')
   then raise exception 'Catalog setup cannot change existing accounts or other records' using errcode='PT403';end if;
   select x into new_account from jsonb_array_elements(p_data->'accounts') x
    where not exists(select 1 from jsonb_array_elements(old_catalog->'accounts') old where old->>'id'=x->>'id');
   if new_account is null or not(new_account ?& array['id','code','name','type','postable','active']::text[])
    or new_account-array['id','code','name','type','postable','active']::text[]<>'{}'::jsonb
    or jsonb_typeof(new_account->'id') is distinct from 'string' or jsonb_typeof(new_account->'code') is distinct from 'string'
    or jsonb_typeof(new_account->'name') is distinct from 'string' or jsonb_typeof(new_account->'type') is distinct from 'string'
    or new_account->>'id' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
    or new_account->>'code' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,39}$'
    or length(btrim(new_account->>'name')) not between 2 and 100 or new_account->>'name' ~ '[[:cntrl:]<>]'
    or new_account->>'type' not in ('Asset','Liability','Equity','Income','Cost of Sales','Expense')
    or jsonb_typeof(new_account->'postable') is distinct from 'boolean' or new_account->'active' is distinct from 'true'::jsonb
    or exists(select 1 from jsonb_array_elements(old_catalog->'accounts') old where lower(btrim(old->>'code'))=lower(btrim(new_account->>'code'))
      or regexp_replace(lower(btrim(old->>'name')),'\s+',' ','g')=regexp_replace(lower(btrim(new_account->>'name')),'\s+',' ','g'))
   then raise exception 'Use a valid unique account code, name and supported type' using errcode='PT400';end if;
  end;
 end if;
 -- Financial activation is intentionally absent from this candidate; metadata cannot bypass the gate.
$guard$);
 execute definition;
end $$;
commit;
