-- Synthetic staging only. Preserve the current commit function and all guards;
-- avoid reconstructing the entire canonical workspace once per existing journal.
-- Fail closed if the reviewed body has changed. No timeout, policy, role or
-- production function is changed by this migration.
begin;
do $$
declare
  definition text;
  declaration_marker text := 'declare a jsonb; c uuid;';
  projection_marker text := '  select value into old_j from jsonb_array_elements(azzora.staging_canonical_data(c)->''journals'') where value->>''id''=j->>''id'';';
  inserted_marker text := '   for l in select value from jsonb_array_elements(j->''lines'') loop';
begin
  perform azzora.assert_synthetic_staging();
  definition := pg_get_functiondef('public.staging_company_commit(text,bigint,text,text,text,jsonb,jsonb,boolean)'::regprocedure);
  if (length(definition)-length(replace(definition,declaration_marker,'')))/length(declaration_marker) <> 1
    or (length(definition)-length(replace(definition,projection_marker,'')))/length(projection_marker) <> 1
    or (length(definition)-length(replace(definition,inserted_marker,'')))/length(inserted_marker) <> 1 then
    raise exception 'Reviewed staging commit markers changed; optimization not applied';
  end if;
  definition := replace(definition,declaration_marker,'declare cached_journals jsonb; a jsonb; c uuid;');
  definition := replace(definition,projection_marker,
    E'  if cached_journals is null then\n   cached_journals := azzora.staging_canonical_data(c)->''journals'';\n  end if;\n  select value into old_j from jsonb_array_elements(cached_journals) where value->>''id''=j->>''id'';');
  -- A newly inserted journal must be visible to the next item, including a
  -- duplicate ID later in the same payload. Rebuild only after an insertion.
  definition := replace(definition,inserted_marker,
    E'   cached_journals := null;\n   for l in select value from jsonb_array_elements(j->''lines'') loop');
  execute definition;
end $$;
commit;
