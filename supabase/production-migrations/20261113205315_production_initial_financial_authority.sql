-- Owner-approved finite operating release; not a historical import or approval
-- of unknown opening balances. The owner also explicitly accepted DeepSeek's
-- documented processing-policy uncertainty for review-only business uploads.
begin;
lock table azzora.production_environment in access exclusive mode;
lock table azzora.companies in share row exclusive mode;
do $$
declare e azzora.production_environment; authority jsonb;
begin
 select * into strict e from azzora.production_environment;
 if e.company_id<>'fc525d78-bc83-4845-96f1-fb402bb07465'::uuid or e.project_ref<>'zwjiztnsxenluqybxhhz'
 or e.vercel_project_id<>'prj_2Kr1T82kCiU5eSk1SZFOcAPQlBfV' or e.region<>'ap-southeast-1'
 or e.approved_by<>'86d914dd-1f39-4860-87d0-b671dd39eb00'::uuid
 then raise exception 'Approved production identity required';end if;
 if not exists(select 1 from azzora.memberships m join auth.users u on u.id=m.user_id where m.company_id=e.company_id and m.user_id='c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3' and m.role='accountant' and m.active and m.finance_access and u.email='accounts@azzora.ae')
 then raise exception 'Approved active Accountant required';end if;
 if not exists(select 1 from pg_trigger where tgrelid='azzora.production_environment'::regclass and tgname='production_configuration_immutable' and tgenabled='O') then raise exception 'Protected production configuration required';end if;
 if exists(select 1 from azzora.audit_events where company_id=e.company_id and request_id='owner-live-20261115-v1') then raise exception 'Financial authority already recorded; do not replay this migration';end if;
 authority:=jsonb_build_object('version',1,'approvalId','owner-live-20261115-v1','companyId',e.company_id,'companyName','Azzora','noVat',true,'taxRegistration','unconfirmed','taxInvoiceEnabled',false,'effectiveFrom','2026-11-15','timezone','Asia/Dubai','postingUserId','c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3','expenseApproverId','c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3','expenseApprovalMode','accountant-auto-approved','approvedBy',e.approved_by,'approvedAt',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'instructionSha256','8546a8b91cc3bc56e5398ff44838a73933f72e376ce4be361148254bd66d0f63');
 insert into azzora.audit_events(company_id,actor_id,action,entity_type,entity_id,request_id,metadata)
 values(e.company_id,e.approved_by,'production.initial-finance.approve','production_environment',e.company_id::text,'owner-live-20261115-v1',jsonb_build_object('authority',authority,'openingBalancesApproved',false,'openingFiguresAssumed',false,'expenseAuthorityConfirmed',true,'expenseApprovalMode','accountant-auto-approved','realDocumentProcessingException','owner-live-20261114-deepseek-policy-exception'));
 -- Existing engine control mappings, never fictional bank/equity balances.
 insert into azzora.accounts(company_id,id,code,name,type,postable,active) values
 (e.company_id,'receivables','1100','Accounts receivable','Asset',true,true),
 (e.company_id,'payables','2100','Accounts payable','Liability',true,true),
 (e.company_id,'revenue','4000','Design & build revenue','Income',true,true),
 (e.company_id,'cost','5000','Project cost of sales','Cost of Sales',true,true),
 (e.company_id,'operating','6000','Operating expenses','Expense',true,true)
 on conflict(company_id,id) do nothing;
 if (select count(*) from azzora.accounts a join (values('receivables','1100','Asset'),('payables','2100','Liability'),('revenue','4000','Income'),('cost','5000','Cost of Sales'),('operating','6000','Expense')) expected(id,code,type) on a.id=expected.id and a.code=expected.code and a.type=expected.type where a.company_id=e.company_id and a.active and a.postable)<>5
 then raise exception 'Existing chart conflicts with required engine controls; no accounts were renamed or balances inferred';end if;
 update azzora.records set payload=jsonb_set(jsonb_set(jsonb_set(payload,'{metadata,operations,settings,company,name}','"Azzora"'),'{metadata,operations,settings,vatPercentage}','"0"'),'{metadata,operations,settings,tax}','"No VAT"'),version=version+1
 where company_id=e.company_id and entity_type='workspace_metadata' and id='__production_metadata';
 if not found then raise exception 'Initialized production workspace required';end if;
 update azzora.companies set name='Azzora',version=version+1 where id=e.company_id;
 update azzora.memberships set capabilities=array_append(array_append(capabilities,'finance.post'),'expense.approve') where company_id=e.company_id and user_id='c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3' and not('finance.post'=any(capabilities));
end $$;
create function azzora.initial_finance_now() returns timestamptz language sql stable set search_path='' as $$select statement_timestamp()$$;
revoke all on function azzora.initial_finance_now() from public,anon,authenticated,service_role,azzora_api;
create function azzora.initial_finance_authority() returns jsonb language sql stable security definer set search_path='' as $$
 select case when count(*)=1 then (jsonb_agg(metadata->'authority'))->0 else null end
 from azzora.audit_events where company_id='fc525d78-bc83-4845-96f1-fb402bb07465' and actor_id='86d914dd-1f39-4860-87d0-b671dd39eb00'
 and action='production.initial-finance.approve' and request_id='owner-live-20261115-v1'
 and metadata->'authority'->>'instructionSha256'='8546a8b91cc3bc56e5398ff44838a73933f72e376ce4be361148254bd66d0f63'
$$;
revoke all on function azzora.initial_finance_authority() from public,anon,authenticated,service_role,azzora_api;
-- Password assurance remains honest AAL1 for the same exact approved identities.
create or replace function azzora.production_password_only(g jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(g->>'companyId'='fc525d78-bc83-4845-96f1-fb402bb07465'
 and ((g->>'userId'='86d914dd-1f39-4860-87d0-b671dd39eb00' and g->>'email'='info@azzora.ae' and g->>'role'='owner_admin' and not(g->'capabilities' ? 'finance.post'))
 or (g->>'userId'='c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3' and g->>'email'='accounts@azzora.ae' and g->>'role'='accountant' and (not(g->'capabilities' ? 'finance.post') or azzora.initial_finance_authority() is not null)))
 and not(g->'capabilities' ? 'finance.simulate')
 and exists(select 1 from azzora.production_environment e join azzora.memberships m on m.company_id=e.company_id where e.company_id='fc525d78-bc83-4845-96f1-fb402bb07465' and e.project_ref='zwjiztnsxenluqybxhhz' and e.vercel_project_id='prj_2Kr1T82kCiU5eSk1SZFOcAPQlBfV' and m.user_id=(g->>'userId')::uuid and m.active and m.role=g->>'role'),false)
$$;
revoke all on function azzora.production_password_only(jsonb) from public,anon,authenticated,service_role,azzora_api;
create function azzora.assert_initial_financial_commit(a jsonb,c uuid,scope jsonb,data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare authority jsonb:=azzora.initial_finance_authority(); old_data jsonb; old_meta jsonb; new_meta jsonb; review jsonb; approval azzora.audit_events; business_date date:=(azzora.initial_finance_now() at time zone 'Asia/Dubai')::date; operation text:=scope->>'financialAction'; j jsonb;
begin
 if authority is null or c<>'fc525d78-bc83-4845-96f1-fb402bb07465'::uuid or a->>'userId'<>'c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3'
 or a->>'role'<>'accountant' or a->>'workspace'<>'accountant' or not(a->'capabilities' ? 'finance.post') or not coalesce((scope->>'financial')::boolean,false)
 then raise exception 'Only the approved Accountant may post' using errcode='PT403';end if;
 if business_date<'2026-11-15'::date then raise exception 'Accounting starts on 15 November Dubai time' using errcode='PT423';end if;
 if operation is null or operation not in ('invoice','update-invoice-draft','issue-invoice','bill','update-bill-draft','issue-bill','receipt','supplier-payment','opening-post')
 then raise exception 'This financial operation has no initial approval' using errcode='PT423';end if;
 old_data:=azzora.production_canonical_data(c);
 if operation='opening-post' then
  select x->'payload'->'metadata'->'finance' into old_meta from jsonb_array_elements(old_data->'records') x where x->>'entity_type'='workspace_metadata';
  select x->'payload'->'metadata'->'finance' into new_meta from jsonb_array_elements(data->'records') x where x->>'entity_type'='workspace_metadata';
  review:=old_meta->'openingReview';
  if review->'posted' is not null and review->'posted'<>'null'::jsonb then raise exception 'Opening figures already posted' using errcode='PT409';end if;
  if review->'ownerApproval'->>'by' is distinct from '86d914dd-1f39-4860-87d0-b671dd39eb00' or review->'reconciliation'->>'by' is distinct from 'c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3' or review->'reconciliation'->'complete' is distinct from 'true'::jsonb
   or review->'ownerApproval'->>'digest' is distinct from scope->>'openingDigest' or review->'reconciliation'->>'digest' is distinct from scope->>'openingDigest'
   or new_meta->'openingReview'->'posted'->>'by' is distinct from a->>'userId' or new_meta->'openingSetup' is distinct from old_meta->'openingSetup'
  then raise exception 'Current complete Accountant reconciliation and independent Owner opening approval required' using errcode='PT403';end if;
  select * into approval from azzora.audit_events where company_id=c and actor_id='86d914dd-1f39-4860-87d0-b671dd39eb00' and action='opening.approved' and metadata->>'digest'=scope->>'openingDigest' and metadata->>'revision'=scope->>'openingRevision' order by id desc limit 1;
  if not found or approval.metadata->'draft' is distinct from old_meta->'openingSetup' or approval.metadata->'accounts' is distinct from old_data->'accounts' or approval.metadata->'parties' is distinct from old_data->'parties'
  then raise exception 'Opening approval does not match authoritative draft and mappings' using errcode='PT403';end if;
 end if;
 for j in select value from jsonb_array_elements(data->'journals') x(value) where not exists(select 1 from azzora.journals old where old.company_id=c and old.id=x.value->>'id') loop
  if (j->>'posting_date')::date>business_date or (operation<>'opening-post' and (j->>'posting_date')::date<'2026-11-15'::date)
   or (j->>'recorded_at')::timestamptz>azzora.initial_finance_now()+interval '1 minute'
   or (operation='opening-post' and ((j->>'posting_date')::date<>(old_meta->'openingSetup'->>'date')::date or j->>'source_type'<>'document' or j->>'source_id'<>'opening:'||(scope->>'openingDigest')))
  then raise exception 'Financial date or source is outside approval' using errcode='PT423';end if;
 end loop;
 if operation in ('invoice','update-invoice-draft','issue-invoice') then
  if exists(select 1 from jsonb_array_elements(data->'records') x where x->>'entity_type'='sales_invoice' and x->>'status'='Issued' and not exists(select 1 from azzora.records r where r.company_id=c and r.entity_type='sales_invoice' and r.id=x->>'id' and r.status='Issued') and (length(trim(coalesce(x->'payload'->'finance'->>'invoiceReference','')))=0 or length(x->'payload'->'finance'->>'invoiceReference')>100)) then raise exception 'Explicit approved invoice number required' using errcode='PT423';end if;
  if exists(select 1 from jsonb_array_elements(data->'records') x where x->>'entity_type'='sales_invoice' and x->>'status'='Issued' and coalesce(x->'payload'->'finance'->>'invoiceReference','')<>'' group by lower(trim(x->'payload'->'finance'->>'invoiceReference')) having count(*)>1) then raise exception 'Invoice number already issued' using errcode='PT409';end if;
 end if;
 if exists(select 1 from jsonb_array_elements(data->'records') x where x->>'entity_type' in ('sales_invoice','supplier_bill') and x->'payload' ? 'finance'
  and not exists(select 1 from azzora.records old where old.company_id=c and old.entity_type=x->>'entity_type' and old.id=x->>'id' and old.payload=x->'payload')
  and ((x->'payload'->'finance'->>'invoiceType')='Tax Invoice' or coalesce(x->'payload'->'finance'->>'taxFils','0')<>'0'))
 then raise exception 'Legal Tax Invoices and VAT-bearing posting remain disabled' using errcode='PT423';end if;
end $$;
revoke all on function azzora.assert_initial_financial_commit(jsonb,uuid,jsonb,jsonb) from public,anon,authenticated,service_role,azzora_api;
create function azzora.opening_review_projection(data jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; result jsonb:='{}'::jsonb; normalized jsonb;
begin
 foreach k in array array['accounts','parties','projects','departments','records','periods','journals','snapshots'] loop
  if jsonb_typeof(data->k) is distinct from 'array' then raise exception 'Complete canonical data required' using errcode='PT403';end if;
  select coalesce(jsonb_agg(value order by value::text),'[]'::jsonb) into normalized from (select case when k='records' and x->>'entity_type'='workspace_metadata' then x#-'{payload,metadata,finance,openingReview}' else x end value from jsonb_array_elements(data->k) x) q;
  result:=result||jsonb_build_object(k,normalized);
 end loop;return result;
end $$;
revoke all on function azzora.opening_review_projection(jsonb) from public,anon,authenticated,service_role,azzora_api;
create function azzora.assert_initial_opening_review(a jsonb,c uuid,scope jsonb,data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare old_data jsonb:=azzora.production_canonical_data(c); old_finance jsonb; new_finance jsonb; stamp jsonb; operation text:=scope->>'openingOperation'; receipt azzora.audit_events;
begin
 if azzora.initial_finance_authority() is null or c<>'fc525d78-bc83-4845-96f1-fb402bb07465'::uuid or a->>'workspace'<>'accountant' or coalesce((scope->>'financial')::boolean,true) then raise exception 'Opening review denied' using errcode='PT403';end if;
 if azzora.opening_review_projection(data) is distinct from azzora.opening_review_projection(old_data) then raise exception 'Opening confirmation cannot modify other company records' using errcode='PT403';end if;
 select x->'payload'->'metadata'->'finance' into old_finance from jsonb_array_elements(old_data->'records') x where x->>'entity_type'='workspace_metadata';
 select x->'payload'->'metadata'->'finance' into new_finance from jsonb_array_elements(data->'records') x where x->>'entity_type'='workspace_metadata';
 if new_finance->'openingSetup' is distinct from old_finance->'openingSetup' or new_finance->'openingReview'->'revision' is distinct from old_finance->'openingReview'->'revision' or new_finance->'openingReview' ? 'posted'
 then raise exception 'Review cannot change figures or post' using errcode='PT403';end if;
 if operation='opening-reconcile' then
  stamp:=new_finance->'openingReview'->'reconciliation';
  if a->>'userId'<>'c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3' or a->>'role'<>'accountant' or stamp->'complete' is distinct from 'true'::jsonb then raise exception 'Accountant reconciliation required' using errcode='PT403';end if;
 elsif operation='opening-approve' then
  stamp:=new_finance->'openingReview'->'ownerApproval';
  if a->>'userId'<>'86d914dd-1f39-4860-87d0-b671dd39eb00' or a->>'role'<>'owner_admin' or not(a->'capabilities' ? 'access.manage') then raise exception 'Independent Owner confirmation required' using errcode='PT403';end if;
  select * into receipt from azzora.audit_events where company_id=c and actor_id='c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3' and action='opening.reconciled' and metadata->>'digest'=scope->>'openingDigest' and metadata->>'revision'=scope->>'openingRevision' order by id desc limit 1;
  if not found or receipt.metadata->'draft' is distinct from old_finance->'openingSetup' or receipt.metadata->'accounts' is distinct from old_data->'accounts' or receipt.metadata->'parties' is distinct from old_data->'parties' then raise exception 'Current reconciliation receipt required' using errcode='PT403';end if;
 else raise exception 'Unsupported opening review' using errcode='PT403';end if;
 if stamp is null or stamp->>'by' is distinct from a->>'userId' or stamp->>'digest' is distinct from scope->>'openingDigest' or stamp->>'revision' is distinct from scope->>'openingRevision' then raise exception 'Review attribution or revision mismatch' using errcode='PT403';end if;
end $$;
revoke all on function azzora.assert_initial_opening_review(jsonb,uuid,jsonb,jsonb) from public,anon,authenticated,service_role,azzora_api;
do $$
declare d text; marker text; constraint_name text;
begin
 select conname into strict constraint_name from pg_constraint where conrelid='azzora.production_environment'::regclass and contype='c' and pg_get_constraintdef(oid) like '%NOT real_financial_posting_enabled%';
 execute format('alter table azzora.production_environment drop constraint %I',constraint_name);
 execute 'drop trigger production_configuration_immutable on azzora.production_environment';
 update azzora.production_environment set real_financial_posting_enabled=true;
 execute 'create trigger production_configuration_immutable before update or delete on azzora.production_environment for each row execute function azzora.reject_history_mutation()';
 d:=pg_get_functiondef('azzora.assert_production_environment()'::regprocedure);marker:='and not e.real_financial_posting_enabled';
 if position(marker in d)=0 then raise exception 'Production environment financial guard changed';end if;
 execute replace(d,marker,'and (not e.real_financial_posting_enabled or azzora.initial_finance_authority() is not null)');
 d:=pg_get_functiondef('public.azzora_production_auth_grant(uuid)'::regprocedure);marker:='and not (''finance.post''=any(m.capabilities))';
 if position(marker in d)=0 then raise exception 'Production financial role guard changed';end if;
 execute replace(d,marker,'and (not (''finance.post''=any(m.capabilities)) or (m.user_id=''c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3''::uuid and m.role=''accountant'' and azzora.initial_finance_authority() is not null))');
 d:=pg_get_functiondef('public.azzora_runtime_identity(uuid)'::regprocedure);marker:='''financialPostingEnabled'',false';
 if position(marker in d)=0 then raise exception 'Production runtime financial proof changed';end if;
 d:=replace(d,marker,'''financialPostingEnabled'',e.real_financial_posting_enabled,''financialAuthority'',azzora.initial_finance_authority()');execute d;
 d:=pg_get_functiondef('public.azzora_runtime_identity(uuid)'::regprocedure);marker:='''realDocumentProcessingEnabled'',false';
 if position(marker in d)=0 then raise exception 'Production runtime document proof changed';end if;
 d:=replace(d,marker,'''realDocumentProcessingEnabled'',true');execute d;
 d:=pg_get_functiondef('public.azzora_production_company_commit(text,bigint,text,text,text,jsonb,jsonb,boolean)'::regprocedure);
 marker:='then raise exception ''Approved accounting policy and cutover required'' using errcode=''PT423'';end if;';
 if position(marker in d)=0 then raise exception 'Production posting guard changed';end if;
 d:=replace(d,marker,'then perform azzora.assert_initial_financial_commit(a,c,p_scope,p_data);end if;');
 marker:='then raise exception ''Financial document transition requires approved posting'' using errcode=''PT423'';end if;';
 if position(marker in d)=0 then raise exception 'Production document transition guard changed';end if;
 d:=replace(d,marker,'then perform azzora.assert_initial_financial_commit(a,c,p_scope,p_data);end if;');
 marker:='if coalesce((p_scope->>''financial'')::boolean,false) and not (a->''capabilities'' ? ''finance.simulate'') then raise exception ''Fictional simulation denied'' using errcode=''PT403''; end if;';
 if position(marker in d)=0 then raise exception 'Production finance capability boundary changed';end if;
 d:=replace(d,marker,'if coalesce((p_scope->>''financial'')::boolean,false) then perform azzora.assert_initial_financial_commit(a,c,p_scope,p_data);end if;');
 marker:=' -- No removed financial records or overwritten immutable history.';
 if position(marker in d)=0 then raise exception 'Production immutable history guard changed';end if;
 d:=replace(d,marker,$review$
 if exists(select 1 from azzora.records old join jsonb_array_elements(p_data->'records') x on x->>'entity_type'=old.entity_type and x->>'id'=old.id where old.company_id=c and old.entity_type='workspace_metadata' and old.payload->'metadata'->'finance'->'openingReview' ? 'posted' and (old.payload->'metadata'->'finance'->'openingSetup' is distinct from x->'payload'->'metadata'->'finance'->'openingSetup' or old.payload->'metadata'->'finance'->'openingReview' is distinct from x->'payload'->'metadata'->'finance'->'openingReview')) then raise exception 'Posted opening confirmation is immutable' using errcode='PT403';end if;
 if p_scope->>'openingOperation' in ('opening-reconcile','opening-approve') then perform azzora.assert_initial_opening_review(a,c,p_scope,p_data);end if;
 -- No removed financial records or overwritten immutable history.
$review$);
 marker:='insert into azzora.command_receipts(company_id,idempotency_key,request_sha256,actor_id,result)';
 if position(marker in d)=0 then raise exception 'Production command receipt boundary changed';end if;
 d:=replace(d,marker,$receipt$
 if p_scope->>'openingOperation' in ('opening-reconcile','opening-approve') then
  insert into azzora.audit_events(company_id,actor_id,action,entity_type,entity_id,request_id,metadata)
  select c,actor,case when p_scope->>'openingOperation'='opening-reconcile' then 'opening.reconciled' else 'opening.approved' end,'opening','opening-setup',p_idempotency_key,
  jsonb_build_object('digest',p_scope->>'openingDigest','revision',p_scope->'openingRevision','draft',x->'payload'->'metadata'->'finance'->'openingSetup','accounts',p_data->'accounts','parties',p_data->'parties')
  from jsonb_array_elements(p_data->'records') x where x->>'entity_type'='workspace_metadata';
 end if;
 insert into azzora.command_receipts(company_id,idempotency_key,request_sha256,actor_id,result)
$receipt$);
 d:=replace(d,'''mode'',''fictional-staging''','''mode'',''production''');execute d;
 perform azzora.assert_production_environment();
end $$;
commit;
