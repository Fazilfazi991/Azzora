-- CLI-generated reviewed hostname-only production configuration migration.
-- Owner: "one more thing is we have to change the vercel url to azzoracrm.vercel,app"
-- The comma typo is interpreted as a dot. Original hostname remains authorized.
-- No credentials, memberships, financial records, posting or AI flags change.
begin;
lock table azzora.production_environment in access exclusive mode;
do $$
declare e azzora.production_environment; previous jsonb; current_config jsonb;
begin
 select * into strict e from azzora.production_environment;
 if e.company_id<>'fc525d78-bc83-4845-96f1-fb402bb07465'::uuid
 or e.project_ref<>'zwjiztnsxenluqybxhhz' or e.region<>'ap-southeast-1'
 or e.vercel_project_id<>'prj_2Kr1T82kCiU5eSk1SZFOcAPQlBfV'
 or e.storage_bucket<>'azzora-private'
 or e.approved_by<>'86d914dd-1f39-4860-87d0-b671dd39eb00'::uuid
 or e.real_financial_posting_enabled or e.real_document_processing_enabled
 then raise exception 'Unexpected production identity; hostname approval not applied';end if;
 if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='azzora.production_environment'::regclass and tgname='production_configuration_immutable' and not tgisinternal and tgenabled='O' and tgfoid='azzora.reject_history_mutation()'::regprocedure)
 then raise exception 'Reviewed configuration protection required';end if;

 if e.configuration_approval_id='owner-production-hostname-20261113'
 and e.allowed_origins=array['https://azzora-accounts-live.vercel.app','https://azzoracrm.vercel.app']::text[]
 and e.approval_evidence_sha256='a8bbba63af466d1e973803352f038b3144b1f305688d54a13855a6b900de7562'
 then
  if (select count(*) from azzora.audit_events where company_id=e.company_id and actor_id=e.approved_by and action='production.hostname.approve' and request_id='owner-production-hostname-20261113')<>1
  then raise exception 'Existing hostname approval audit receipt required';end if;
  perform azzora.assert_production_environment();
  return;
 end if;
 if e.configuration_approval_id<>'owner-production-setup-20261113'
 or e.allowed_origins<>array['https://azzora-accounts-live.vercel.app']::text[]
 or e.approval_evidence_sha256<>'a0919772722bec19888c22e40d484b675c9e386a1bba52625d7537fc35849741'
 then raise exception 'Hostname approval baseline differs; no configuration overwritten';end if;
 previous:=to_jsonb(e);
 -- The exclusive lock and transactional DDL prevent any concurrent observer or
 -- writer from seeing an unprotected configuration. An error rolls everything back.
 execute 'drop trigger production_configuration_immutable on azzora.production_environment';
 update azzora.production_environment
 set allowed_origins=array['https://azzora-accounts-live.vercel.app','https://azzoracrm.vercel.app'],
 configuration_approval_id='owner-production-hostname-20261113',
 approval_evidence_sha256='a8bbba63af466d1e973803352f038b3144b1f305688d54a13855a6b900de7562',
 approved_at=now()
 where singleton;
 execute 'create trigger production_configuration_immutable before update or delete on azzora.production_environment for each row execute function azzora.reject_history_mutation()';
 select to_jsonb(p) into current_config from azzora.production_environment p;
 insert into azzora.audit_events(company_id,actor_id,action,entity_type,entity_id,request_id,metadata)
 values(e.company_id,e.approved_by,'production.hostname.approve','production_environment',e.company_id::text,'owner-production-hostname-20261113',jsonb_build_object('previous',previous,'approved',current_config));
 perform azzora.assert_production_environment();
end $$;
commit;
