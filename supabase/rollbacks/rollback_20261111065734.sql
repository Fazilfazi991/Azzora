-- Controlled inverse for the fictional-staging journal projection optimization.
-- Function-only, no deletes/data writes. Do not run against production.
begin;
do $$
declare
  definition text;
  declaration_marker text := 'declare cached_journals jsonb; a jsonb; c uuid;';
  projection_marker text := E'  if cached_journals is null then\n   cached_journals := azzora.staging_canonical_data(c)->''journals'';\n  end if;\n  select value into old_j from jsonb_array_elements(cached_journals) where value->>''id''=j->>''id'';';
  inserted_marker text := E'   cached_journals := null;\n   for l in select value from jsonb_array_elements(j->''lines'') loop';
begin
  perform azzora.assert_synthetic_staging();
  definition := pg_get_functiondef('public.staging_company_commit(text,bigint,text,text,text,jsonb,jsonb,boolean)'::regprocedure);
  if (length(definition)-length(replace(definition,declaration_marker,'')))/length(declaration_marker) <> 1
    or (length(definition)-length(replace(definition,projection_marker,'')))/length(projection_marker) <> 1
    or (length(definition)-length(replace(definition,inserted_marker,'')))/length(inserted_marker) <> 1 then
    raise exception 'Reviewed optimized staging commit markers changed; rollback not applied';
  end if;
  definition := replace(definition,declaration_marker,'declare a jsonb; c uuid;');
  definition := replace(definition,projection_marker,'  select value into old_j from jsonb_array_elements(azzora.staging_canonical_data(c)->''journals'') where value->>''id''=j->>''id'';');
  definition := replace(definition,inserted_marker,'   for l in select value from jsonb_array_elements(j->''lines'') loop');
  execute definition;
end $$;
commit;
