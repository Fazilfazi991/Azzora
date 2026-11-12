-- Isolated fictional target only; fixed statements, no dynamic SQL or public grants.
begin;
do $$ begin if current_database() !~ '^azzora_recovery_[a-z0-9_]+$' then raise exception 'Not an isolated recovery database';end if;perform azzora.assert_synthetic_staging();end $$;
create table azzora_recovery_control.restore_receipts(nonce text primary key check(nonce ~ '^[a-f0-9]{64}$'),target_id uuid not null,company_id uuid not null,archive_sha256 text not null,approval_sha256 text not null,created_at timestamptz not null default now());
revoke all on azzora_recovery_control.restore_receipts from public,anon,authenticated,service_role,azzora_api;
create function azzora_recovery_control.restore_business(p_context text,p_seal text) returns void language plpgsql set search_path='' as $$
declare c jsonb; a azzora_recovery_control.authority; d jsonb; p jsonb; r jsonb; l jsonb; actor uuid; company uuid; stage text := 'authorization';
begin
 if current_database() !~ '^azzora_recovery_[a-z0-9_]+$' then raise exception 'Not isolated';end if;perform azzora.assert_synthetic_staging();
 c:=p_context::jsonb;company:=(c->>'companyId')::uuid;d:=c->'data';p:=c->'provenance';
 select * into a from azzora_recovery_control.authority x where x.target_id=(c->>'targetId')::uuid and x.operator_id=(c->>'operatorId')::uuid and x.active for update;
 if not found or a.seal_key is null or octet_length(a.seal_key)<>32 or p_seal is null or p_seal !~ '^[a-f0-9]{64}$' or encode(extensions.hmac(convert_to(p_context,'utf8'),a.seal_key,'sha256'),'hex')<>p_seal then raise exception 'Untrusted context';end if;
 if c->'binding' is null or c->'binding'->>'authContainerId' is distinct from a.auth_container_id or c->'binding'->>'dbContainerId' is distinct from a.db_container_id or c->'binding'->>'storageContainerId' is distinct from a.storage_container_id or c->'binding'->>'authPort' is distinct from a.auth_port or c->'binding'->>'dbPort' is distinct from a.db_port or c->'binding'->>'storagePort' is distinct from a.storage_port or c->'binding'->>'database' is distinct from a.database_name or a.database_name is distinct from current_database() or c->'binding'->>'dbLoopbackOnly' is distinct from 'true' then raise exception 'Recovery target changed';end if;
 if c->>'tokenExpires' is null or c->>'mfaTimestamp' is null or (c->>'tokenExpires')::bigint<=extract(epoch from now()) or (c->>'mfaTimestamp')::bigint>extract(epoch from now()) or (c->>'mfaTimestamp')::bigint<extract(epoch from now())-900 then raise exception 'Expired assurance';end if;
 perform 1 from auth.sessions s where s.id=(c->>'sessionId')::uuid and s.user_id=a.operator_id and s.aal::text='aal2' and (s.not_after is null or s.not_after>now()) for update;if not found then raise exception 'Revoked session';end if;
 perform 1 from auth.mfa_factors f where f.user_id=a.operator_id and f.status::text='verified' and f.factor_type::text='totp' for update;if not found then raise exception 'Revoked factor';end if;
 if d is null or p is null or exists(select 1 from azzora.companies where id<>'11111111-1111-4111-8111-111111111111'::uuid) or
 exists(select 1 from azzora.records) or exists(select 1 from azzora.parties) or exists(select 1 from azzora.projects) or exists(select 1 from azzora.departments) or
 exists(select 1 from azzora.accounts) or exists(select 1 from azzora.accounting_periods) or exists(select 1 from azzora.journals) or exists(select 1 from azzora.journal_lines) or
 exists(select 1 from azzora.snapshots) or exists(select 1 from azzora.audit_events) or exists(select 1 from azzora.command_receipts) or exists(select 1 from azzora.allocations) or
 exists(select 1 from azzora.attachments) or exists(select 1 from azzora.memberships) or exists(select 1 from azzora.project_assignments) or exists(select 1 from azzora.sessions)
 then raise exception 'Target not clean';end if;
 stage := 'clean-target-receipt';
 insert into azzora_recovery_control.restore_receipts(nonce,target_id,company_id,archive_sha256,approval_sha256) values(c->>'nonce',a.target_id,company,c->>'archiveSha256',c->>'approvalDigest');
 stage := 'company';
 insert into azzora.companies(id,name,data_mode,version) values(company,'ISOLATED RESTORE REHEARSAL','fictional-staging',(c->>'version')::bigint);
 stage := 'parties';
 for r in select value from jsonb_array_elements(d->'parties') loop insert into azzora.parties(company_id,id,kind,payload) values(company,r->>'id',r->>'kind',r->'payload');end loop;
 stage := 'departments';
 for r in select value from jsonb_array_elements(d->'departments') loop insert into azzora.departments(company_id,id,name) values(company,r->>'id',r->>'name');end loop;
 stage := 'projects';
 for r in select value from jsonb_array_elements(d->'projects') loop insert into azzora.projects(company_id,id,customer_id,payload) values(company,r->>'id',r->>'customer_id',r->'payload');end loop;
 stage := 'assignments';
 -- Historical memberships retain role metadata and assignment foreign keys,
 -- but remain inactive. Only explicitly mapped replacement identities can log in.
 for r in select value from jsonb_array_elements(p->'memberships') loop
  actor:=(r->>'userId')::uuid;
  if not exists(select 1 from auth.users u where u.id=actor and u.banned_until>now()+interval '50 years') then raise exception 'Historical member unavailable';end if;
  insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities)
  values(company,actor,r->>'role',false,(r->>'financeAccess')::boolean,array(select jsonb_array_elements_text(r->'workspaces')),array(select jsonb_array_elements_text(r->'capabilities')));
 end loop;
 for r in select value from jsonb_array_elements(p->'assignments') loop
  actor:=(r->>'user_id')::uuid;
  if not exists(select 1 from auth.users u where u.id=actor and u.banned_until>now()+interval '50 years') then raise exception 'Historical assignee unavailable';end if;
  insert into azzora.project_assignments(company_id,project_id,user_id,active) values(company,r->>'project_id',actor,(r->>'active')::boolean);
 end loop;
 stage := 'records';
 for r in select value from jsonb_array_elements(d->'records') loop insert into azzora.records(company_id,entity_type,id,project_id,party_id,department_id,payload,status) values(company,r->>'entity_type',r->>'id',r->>'project_id',r->>'party_id',r->>'department_id',r->'payload',r->>'status');end loop;
 stage := 'accounts';
 for r in select value from jsonb_array_elements(d->'accounts') loop insert into azzora.accounts(company_id,id,code,name,type,postable,active) values(company,r->>'id',r->>'code',r->>'name',r->>'type',(r->>'postable')::boolean,(r->>'active')::boolean);end loop;
 stage := 'periods';
 for r in select value from jsonb_array_elements(d->'periods') loop insert into azzora.accounting_periods(company_id,id,start_date,end_date,locked) values(company,r->>'id',(r->>'start_date')::date,(r->>'end_date')::date,(r->>'locked')::boolean);end loop;
 -- Staging permits reversing an original, never a reversal; this also rejects
 -- missing parents and all cycles before any journal rows are inserted.
 if exists(select 1 from jsonb_array_elements(d->'journals') child where child->>'reversal_of' is not null and not exists(select 1 from jsonb_array_elements(d->'journals') parent where parent->>'id'=child->>'reversal_of' and parent->>'reversal_of' is null)) then raise exception 'Invalid reversal graph';end if;
 stage := 'journals';
 for r in select value from jsonb_array_elements(d->'journals') order by (value->>'reversal_of') is not null loop
  select (v->>'actorId')::uuid into actor from jsonb_array_elements(p->'journals') v where v->>'id'=r->>'id';
  if actor is null or not exists(select 1 from auth.users u where u.id=actor and u.banned_until>now()+interval '50 years') then raise exception 'Historical actor unavailable';end if;
  if exists(select 1 from information_schema.columns where table_schema='azzora' and table_name='journals' and column_name='reversal_of') then
  insert into azzora.journals(company_id,id,posting_key,source_type,source_id,source_action,domain_source,posting_date,period_id,memo,currency,recorded_at,actor_id,reversal_of) values(company,r->>'id',r->>'posting_key',r->>'source_type',r->>'source_id',r->>'source_action',r->'domain_source',(r->>'posting_date')::date,r->>'period_id',r->>'memo',r->>'currency',(r->>'recorded_at')::timestamptz,actor,r->>'reversal_of');
  else
   if r->>'reversal_of' is not null then raise exception 'Reversal requires matching schema';end if;
  insert into azzora.journals(company_id,id,posting_key,source_type,source_id,source_action,domain_source,posting_date,period_id,memo,currency,recorded_at,actor_id) values(company,r->>'id',r->>'posting_key',r->>'source_type',r->>'source_id',r->>'source_action',r->'domain_source',(r->>'posting_date')::date,r->>'period_id',r->>'memo',r->>'currency',(r->>'recorded_at')::timestamptz,actor);
  end if;
  for l in select value from jsonb_array_elements(r->'lines') loop insert into azzora.journal_lines(company_id,journal_id,line_no,account_id,debit_fils,credit_fils,project_id,party_id,department_id,domain_dimensions) values(company,r->>'id',(l->>'line_no')::integer,l->>'account_id',(l->>'debit_fils')::bigint,(l->>'credit_fils')::bigint,l->>'project_id',l->>'party_id',l->>'department_id',coalesce(l->'domain_dimensions','{}'::jsonb));end loop;
 end loop;
 stage := 'snapshots';
 for r in select value from jsonb_array_elements(d->'snapshots') loop
  select (v->>'capturedBy')::uuid into actor from jsonb_array_elements(p->'snapshots') v where v->>'entityType'=r->>'entity_type' and v->>'entityId'=r->>'entity_id' and (v->>'revision')::bigint=(r->>'revision')::bigint;
  if actor is null or not exists(select 1 from auth.users u where u.id=actor and u.banned_until>now()+interval '50 years') then raise exception 'Historical actor unavailable';end if;
  insert into azzora.snapshots(company_id,entity_type,entity_id,revision,payload,sha256,captured_by,captured_at) values(company,r->>'entity_type',r->>'entity_id',(r->>'revision')::bigint,r->'payload',r->>'sha256',actor,(select (v->>'capturedAt')::timestamptz from jsonb_array_elements(p->'snapshots') v where v->>'entityType'=r->>'entity_type' and v->>'entityId'=r->>'entity_id' and (v->>'revision')::bigint=(r->>'revision')::bigint));
 end loop;
 stage := 'audit';
 for r in select value from jsonb_array_elements(p->'auditEvents') loop
  actor:=(r->>'actorId')::uuid;if not exists(select 1 from auth.users u where u.id=actor and u.banned_until>now()+interval '50 years') then raise exception 'Historical actor unavailable';end if;
  insert into azzora.audit_events(id,company_id,actor_id,action,entity_type,entity_id,request_id,recorded_at,metadata) overriding system value values((r->>'id')::bigint,company,actor,r->>'action',r->>'entityType',r->>'entityId',r->>'requestId',(r->>'recordedAt')::timestamptz,r->'metadata');
 end loop;
 -- ALTER SEQUENCE RESTART is transactional; setval would survive rollback.
 if jsonb_array_length(p->'auditEvents')>0 then execute format('alter sequence %s restart with %s',pg_get_serial_sequence('azzora.audit_events','id'),((select max(id)+1 from azzora.audit_events))::bigint);end if;
 stage := 'command-receipts';
 for r in select value from jsonb_array_elements(p->'commandReceipts') loop actor:=(r->>'actorId')::uuid;if not exists(select 1 from auth.users u where u.id=actor and u.banned_until>now()+interval '50 years') then raise exception 'Historical actor unavailable';end if;insert into azzora.command_receipts(company_id,idempotency_key,request_sha256,actor_id,result,created_at) values(company,r->>'idempotencyKey',r->>'requestSha256',actor,r->'result',(r->>'createdAt')::timestamptz);end loop;
 stage := 'allocations';
 perform azzora.project_staging_allocations(company);
 stage := 'canonical-check';
 if azzora.staging_canonical_data(company)<>d then raise exception 'Restored business data differs';end if;
exception when others then raise exception 'Recovery restore rejected at % (%); transaction rolled back',stage,sqlstate using errcode='P0001';end $$;
revoke all on function azzora_recovery_control.restore_business(text,text) from public,anon,authenticated,service_role,azzora_api;
commit;
