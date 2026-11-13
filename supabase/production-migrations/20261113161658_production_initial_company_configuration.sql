-- Initial real-company SETUP authorization only, 13 November 2026.
-- Owner source: final production-launch instruction SHA256
-- a0919772722bec19888c22e40d484b675c9e386a1bba52625d7537fc35849741.
-- No credentials, financial records, tax policy, balances or cutover are seeded.
-- Apply only after the three reviewed production schema migrations.
begin;
do $$
begin
 if not exists(select 1 from auth.users where id='86d914dd-1f39-4860-87d0-b671dd39eb00' and email='info@azzora.ae' and email_confirmed_at is not null and raw_app_meta_data->>'azzora_scope'='production')
 or not exists(select 1 from auth.users where id='c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3' and email='accounts@azzora.ae' and email_confirmed_at is not null and raw_app_meta_data->>'azzora_scope'='production')
 then raise exception 'The two approved production Auth identities must be provisioned through supported administration first'; end if;
 if exists(select 1 from azzora.companies where id<>'fc525d78-bc83-4845-96f1-fb402bb07465')
 then raise exception 'Unexpected company in the intended empty production target';end if;
end $$;
insert into azzora.companies(id,name,data_mode) values('fc525d78-bc83-4845-96f1-fb402bb07465','AZZORA','production') on conflict(id) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('azzora-private','azzora-private',false,2097152,array['application/pdf','image/png','image/jpeg']) on conflict(id) do nothing;
insert into azzora.production_environment(company_id,project_ref,region,vercel_project_id,configuration_approval_id,allowed_origins,storage_bucket,approved_by,approval_evidence_sha256,approved_at)
 values('fc525d78-bc83-4845-96f1-fb402bb07465','zwjiztnsxenluqybxhhz','ap-southeast-1','prj_2Kr1T82kCiU5eSk1SZFOcAPQlBfV','owner-production-setup-20261113',array['https://azzora-accounts-live.vercel.app'],'azzora-private','86d914dd-1f39-4860-87d0-b671dd39eb00','a0919772722bec19888c22e40d484b675c9e386a1bba52625d7537fc35849741',now()) on conflict(singleton) do nothing;
insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities)
 values
 ('fc525d78-bc83-4845-96f1-fb402bb07465','86d914dd-1f39-4860-87d0-b671dd39eb00','owner_admin',true,true,array['manager','accountant'],array['project.read','project.write','expense.submit','expense.approve','finance.read','finance.draft','access.manage','task.update','site.submit','document.submit','qa.update']),
 ('fc525d78-bc83-4845-96f1-fb402bb07465','c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3','accountant',true,true,array['accountant'],array['finance.read','finance.draft'])
 on conflict(company_id,user_id) do nothing;
do $$
declare e azzora.production_environment;
begin
 select * into e from azzora.production_environment;
 if e.company_id is distinct from 'fc525d78-bc83-4845-96f1-fb402bb07465'::uuid
 or e.project_ref<>'zwjiztnsxenluqybxhhz' or e.region<>'ap-southeast-1'
 or e.vercel_project_id<>'prj_2Kr1T82kCiU5eSk1SZFOcAPQlBfV'
 or e.configuration_approval_id<>'owner-production-setup-20261113'
 or e.allowed_origins<>array['https://azzora-accounts-live.vercel.app']::text[]
 or e.approved_by<>'86d914dd-1f39-4860-87d0-b671dd39eb00'::uuid
 or e.approval_evidence_sha256<>'a0919772722bec19888c22e40d484b675c9e386a1bba52625d7537fc35849741'
 or e.real_financial_posting_enabled or e.real_document_processing_enabled
 then raise exception 'Existing production environment differs; no configuration was overwritten';end if;
 if (select count(*) from azzora.memberships)<>2
 or not exists(select 1 from azzora.memberships where company_id=e.company_id and user_id=e.approved_by and role='owner_admin' and active and finance_access and workspaces=array['manager','accountant']::text[] and capabilities=array['project.read','project.write','expense.submit','expense.approve','finance.read','finance.draft','access.manage','task.update','site.submit','document.submit','qa.update']::text[])
 or not exists(select 1 from azzora.memberships where company_id=e.company_id and user_id='c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3' and role='accountant' and active and finance_access and workspaces=array['accountant']::text[] and capabilities=array['finance.read','finance.draft']::text[])
 then raise exception 'Existing membership differs; no authority was overwritten';end if;
 perform azzora.assert_production_environment();
end $$;
commit;
