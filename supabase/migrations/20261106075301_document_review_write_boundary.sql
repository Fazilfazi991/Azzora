-- Restrict finance.draft to document review, including at the canonical SQL boundary.
-- No membership, company records, RLS grants or financial policies are changed.
begin;
create function azzora.document_review_projection(p_data jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; values_sorted jsonb; result jsonb := '{}'::jsonb;
begin
 foreach k in array array['parties','projects','departments','accounts','periods','journals','snapshots','records'] loop
  if jsonb_typeof(p_data->k) is distinct from 'array' then
   raise exception 'Complete canonical data required' using errcode='PT403';
  end if;
  select coalesce(jsonb_agg(item order by item::text),'[]'::jsonb) into values_sorted from (
   select case
    when k='records' and x->>'entity_type'='workspace_metadata' then x#-'{payload,metadata,documentDefaults}'
    when k='journals' then jsonb_set(x,'{lines}',coalesce((select jsonb_agg(l||jsonb_build_object('domain_dimensions',coalesce(l->'domain_dimensions','{}'::jsonb)) order by (l->>'line_no')::integer) from jsonb_array_elements(x->'lines') l),'[]'::jsonb))
    else x end item
   from jsonb_array_elements(p_data->k) x
   where not (k='records' and x->>'entity_type'='document' and (
    (x->>'id' like 'review:%' and x->'payload' ? 'review' and (x->'payload')-'review'='{}'::jsonb)
    or (x->>'id' like 'attachment:%' and x->'payload' ? 'attachment' and (x->'payload')-'attachment'='{}'::jsonb)
   ))
  ) normalized;
  result:=result||jsonb_build_object(k,values_sorted);
 end loop;
 return result;
end $$;
revoke all on function azzora.document_review_projection(jsonb) from public,anon,authenticated,azzora_api;

-- Keep the existing transaction function, locks, immutable-history and idempotency
-- logic intact. Fail closed if its reviewed insertion point has changed.
do $$
declare definition text; marker text := ' -- No removed financial records or overwritten immutable history.';
begin
 definition:=pg_get_functiondef('public.staging_company_commit(text,bigint,text,text,text,jsonb,jsonb,boolean)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'Reviewed commit guard insertion point changed'; end if;
 definition:=replace(definition,marker,$guard$
 -- A draft-only actor cannot disguise catalog/posting writes as nonfinancial.
 if not p_bootstrap and a->>'workspace'='accountant' and not (a->'capabilities' ? 'finance.simulate') then
  if not (a->'capabilities' ? 'finance.draft')
   or p_command not in ('accounts.action','document.upload')
   or coalesce((p_scope->>'financial')::boolean,true)
   or azzora.document_review_projection(p_data) is distinct from azzora.document_review_projection(azzora.staging_canonical_data(c)) then
   raise exception 'Document review only; financial and master-data writes denied' using errcode='PT403';
  end if;
 end if;
 -- No removed financial records or overwritten immutable history.
$guard$);
 execute definition;
end $$;
commit;
