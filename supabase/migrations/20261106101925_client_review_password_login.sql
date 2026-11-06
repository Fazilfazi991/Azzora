-- Owner-approved password-only login for the exact fictional document-review identity.
-- Full Accountants/Owners retain MFA and all existing financial write restrictions.
begin;
create function azzora.password_only_client_review(g jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(g->>'authenticationPolicy'='client-review-password-only'
 and g->>'userId'='52f925bd-8744-48cc-8781-d20109387d14'
 and g->>'companyId'='11111111-1111-4111-8111-111111111111'
 and g->>'email'='client-review@staging.azzora.test'
 and g->>'role'='accountant'
 and g->'workspaces'='["accountant"]'::jsonb
 and jsonb_array_length(g->'capabilities')=2
 and g->'capabilities' @> '["finance.read","finance.draft"]'::jsonb,false)
$$;
revoke all on function azzora.password_only_client_review(jsonb) from public,anon,authenticated,azzora_api;
do $$
declare definition text; old_marker text;
begin
 definition:=pg_get_functiondef('public.staging_auth_grant(uuid)'::regprocedure);
 old_marker:=' return result;';
 if position(old_marker in definition)=0 then raise exception 'Grant insertion point changed'; end if;
 definition:=replace(definition,old_marker,$patch$
 if result->>'userId'='52f925bd-8744-48cc-8781-d20109387d14' then
  result:=result||jsonb_build_object('authenticationPolicy','client-review-password-only');
 end if;
 return result;
$patch$);
 execute definition;
 definition:=pg_get_functiondef('public.staging_auth_session_put(text,text,uuid,uuid,uuid,text,text,text)'::regprocedure);
 old_marker:='if g->>''role'' in (''owner_admin'',''accountant'') and (';
 if position(old_marker in definition)=0 then raise exception 'Session MFA guard changed'; end if;
 execute replace(definition,old_marker,'if g->>''role'' in (''owner_admin'',''accountant'') and not azzora.password_only_client_review(g) and (');
 definition:=pg_get_functiondef('public.staging_auth_actor(text)'::regprocedure);
 if position(old_marker in definition)=0 then raise exception 'Actor MFA guard changed'; end if;
 definition:=replace(definition,old_marker,'if g->>''role'' in (''owner_admin'',''accountant'') and not azzora.password_only_client_review(g) and (');
 old_marker:='g->>''role'' not in (''owner_admin'',''accountant'') or (to_jsonb(ps)->>''aal'')=''aal2''';
 if position(old_marker in definition)=0 then raise exception 'Provider assurance guard changed'; end if;
 definition:=replace(definition,old_marker,'azzora.password_only_client_review(g) or g->>''role'' not in (''owner_admin'',''accountant'') or (to_jsonb(ps)->>''aal'')=''aal2''');
 execute definition;
end $$;
commit;
