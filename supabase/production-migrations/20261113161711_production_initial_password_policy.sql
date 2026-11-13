-- Explicit owner steering: "no need of mfa", 13 November 2026.
-- Password authentication ONLY for the two approved initial production identities.
-- No Auth factors are removed, no fake AAL2, no capabilities or financial gates change.
begin;
create function azzora.production_password_only(g jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(g->>'companyId'='fc525d78-bc83-4845-96f1-fb402bb07465'
 and ((g->>'userId'='86d914dd-1f39-4860-87d0-b671dd39eb00' and g->>'email'='info@azzora.ae' and g->>'role'='owner_admin')
 or (g->>'userId'='c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3' and g->>'email'='accounts@azzora.ae' and g->>'role'='accountant'))
 and not(g->'capabilities' ? 'finance.post') and not(g->'capabilities' ? 'finance.simulate')
 and exists(select 1 from azzora.production_environment e join azzora.memberships m on m.company_id=e.company_id
   where e.company_id='fc525d78-bc83-4845-96f1-fb402bb07465' and e.project_ref='zwjiztnsxenluqybxhhz'
   and e.vercel_project_id='prj_2Kr1T82kCiU5eSk1SZFOcAPQlBfV' and not e.real_financial_posting_enabled and not e.real_document_processing_enabled
   and m.user_id=(g->>'userId')::uuid and m.active and m.role=g->>'role'),false)
$$;
revoke all on function azzora.production_password_only(jsonb) from public,anon,authenticated,service_role,azzora_api;
-- Fail closed if any reviewed insertion point differs. pg_get_functiondef preserves
-- function ACLs and the existing auth, tenant, expiry, lock and idempotency checks.
do $$
declare d text; marker text;
begin
 d:=pg_get_functiondef('public.azzora_production_auth_grant(uuid)'::regprocedure);
 marker:='if result is null then raise exception ''Production membership denied'' using errcode=''PT403'';end if;return result;';
 if position(marker in d)=0 then raise exception 'Reviewed production grant changed';end if;
 execute replace(d,marker,'if result is null then raise exception ''Production membership denied'' using errcode=''PT403'';end if; if azzora.production_password_only(result) then result:=result||jsonb_build_object(''authenticationPolicy'',''production-password-only'');end if;return result;');

 d:=pg_get_functiondef('public.azzora_production_auth_session_put(text,text,uuid,uuid,uuid,text,text,text)'::regprocedure);
 marker:='if g->>''role'' in (''owner_admin'',''accountant'') and (p_assurance<>''aal2'' or not exists(';
 if position(marker in d)=0 then raise exception 'Reviewed session MFA guard changed';end if;
 d:=replace(d,marker,'if g->>''role'' in (''owner_admin'',''accountant'') and not azzora.production_password_only(g) and (p_assurance<>''aal2'' or not exists(');
 marker:='insert into azzora.sessions(token_hash,csrf_hash,user_id,provider_session_id,company_id,workspace,assurance,expires_at)';
 if position(marker in d)=0 then raise exception 'Reviewed session insertion changed';end if;
 d:=replace(d,marker,'if azzora.production_password_only(g) and not exists(select 1 from auth.sessions ps where ps.id=p_provider_session_id and ps.user_id=p_user_id and (to_jsonb(ps)->>''aal'')=p_assurance) then raise exception ''Provider assurance does not match'' using errcode=''PT403'';end if; '||marker);
 execute d;

 d:=pg_get_functiondef('public.azzora_production_auth_actor(text)'::regprocedure);
 marker:='g->>''role'' not in (''owner_admin'',''accountant'') or (to_jsonb(ps)->>''aal'')=''aal2''';
 if position(marker in d)=0 then raise exception 'Reviewed provider assurance guard changed';end if;
 d:=replace(d,marker,'g->>''role'' not in (''owner_admin'',''accountant'') or (to_jsonb(ps)->>''aal'')=''aal2'' or (azzora.production_password_only(g) and (to_jsonb(ps)->>''aal'')=s.assurance)');
 marker:='if g->>''role'' in (''owner_admin'',''accountant'') and (s.assurance<>''aal2'' or not exists(';
 if position(marker in d)=0 then raise exception 'Reviewed current MFA guard changed';end if;
 d:=replace(d,marker,'if g->>''role'' in (''owner_admin'',''accountant'') and not azzora.production_password_only(g) and (s.assurance<>''aal2'' or not exists(');
 marker:='return g || jsonb_build_object(';
 if position(marker in d)=0 then raise exception 'Reviewed actor return changed';end if;
 d:=replace(d,marker,'if azzora.production_password_only(g) then g:=g||jsonb_build_object(''passwordVerifiedAt'',floor(extract(epoch from s.created_at)*1000));end if; '||marker);
 execute d;

 d:=pg_get_functiondef('public.azzora_production_company_commit(text,bigint,text,text,text,jsonb,jsonb,boolean)'::regprocedure);
 marker:='if needed=''access.manage'' and (a->>''role''<>''owner_admin'' or a->>''assurance''<>''aal2'') then';
 if position(marker in d)=0 then raise exception 'Reviewed administration guard changed';end if;
 execute replace(d,marker,'if needed=''access.manage'' and (a->>''role''<>''owner_admin'' or (a->>''assurance''<>''aal2'' and not azzora.production_password_only(a))) then');

 d:=pg_get_functiondef('public.azzora_production_owner_backup(text)'::regprocedure);
 marker:='a->>''role''<>''owner_admin'' or a->>''assurance''<>''aal2'' or a->>''workspace''<>''manager''';
 if position(marker in d)=0 then raise exception 'Reviewed Owner backup guard changed';end if;
 d:=replace(d,marker,'a->>''role''<>''owner_admin'' or (a->>''assurance''<>''aal2'' and not azzora.production_password_only(a)) or a->>''workspace''<>''manager''');
 marker:='c:=(a->>''companyId'')::uuid;';
 if position(marker in d)=0 then raise exception 'Reviewed backup company assignment changed';end if;
 d:=replace(d,marker,'if azzora.production_password_only(a) and not exists(select 1 from azzora.sessions s where s.token_hash=p_session_hash and s.created_at>now()-interval ''15 minutes'') then raise exception ''Recent password sign-in required'' using errcode=''PT403'';end if; '||marker);
 execute d;
end $$;
commit;
