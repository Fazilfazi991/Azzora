-- Local preparation only. Apply to a separately approved AZZORA staging project.
-- The private schema is deliberately not a PostgREST exposed schema.
begin;
create schema azzora;
revoke all on schema azzora from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'azzora_api') then
    create role azzora_api nologin noinherit;
  end if;
end $$;
grant usage on schema azzora to azzora_api;
alter default privileges in schema azzora revoke execute on functions from public;

create table azzora.companies (
  id uuid primary key default gen_random_uuid(), name text not null,
  created_at timestamptz not null default now()
);
create table azzora.memberships (
  company_id uuid not null references azzora.companies(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner_admin','project_manager','accountant','site_staff')),
  active boolean not null default false,
  finance_access boolean not null default false,
  primary key(company_id,user_id),
  check (not finance_access or role in ('owner_admin','accountant'))
);
create table azzora.sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id), provider_session_id uuid not null,
  company_id uuid not null, csrf_hash text not null,
  created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null, revoked_at timestamptz,
  assurance text not null check (assurance in ('aal1','aal2')),
  foreign key(company_id,user_id) references azzora.memberships(company_id,user_id),
  check(expires_at > created_at)
);
create index sessions_actor on azzora.sessions(company_id,user_id) where revoked_at is null;

-- Legacy IDs are text, preserved verbatim. JSON payloads preserve complete existing
-- versions; indexed identities/relations remain relational and tenant constrained.
create table azzora.parties (
  company_id uuid not null references azzora.companies(id), id text not null,
  kind text not null check(kind in ('customer','supplier','both')),
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  version bigint not null default 1 check(version>0), primary key(company_id,id)
);
create table azzora.departments (
  company_id uuid not null references azzora.companies(id), id text not null,
  name text not null, primary key(company_id,id), unique(company_id,name)
);
create table azzora.projects (
  company_id uuid not null references azzora.companies(id), id text not null,
  customer_id text, payload jsonb not null check(jsonb_typeof(payload)='object'),
  version bigint not null default 1 check(version>0), primary key(company_id,id),
  foreign key(company_id,customer_id) references azzora.parties(company_id,id)
);
create table azzora.project_assignments (
  company_id uuid not null, project_id text not null, user_id uuid not null,
  active boolean not null default true, primary key(company_id,project_id,user_id),
  foreign key(company_id,project_id) references azzora.projects(company_id,id),
  foreign key(company_id,user_id) references azzora.memberships(company_id,user_id)
);
create table azzora.records (
  company_id uuid not null references azzora.companies(id),
  entity_type text not null check(entity_type in (
    'quotation','contract','sales_invoice','purchase_order','supplier_bill',
    'receipt','supplier_payment','expense','employee','task','phase','milestone',
    'planning','document','approval','site_update','snag','handover','assignment',
    'cash_account','transfer','expense_ledger','variation','credit_note','refund',
    'budget','material','rfq','supplier_quote','delivery','stock_movement')),
  id text not null, project_id text, party_id text, department_id text,
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  version bigint not null default 1 check(version>0),
  status text not null default 'draft', created_at timestamptz not null default now(),
  primary key(company_id,entity_type,id),
  foreign key(company_id,project_id) references azzora.projects(company_id,id),
  foreign key(company_id,party_id) references azzora.parties(company_id,id),
  foreign key(company_id,department_id) references azzora.departments(company_id,id)
);
create index records_project on azzora.records(company_id,project_id,entity_type);
create table azzora.snapshots (
  company_id uuid not null, entity_type text not null, entity_id text not null,
  revision bigint not null check(revision>0), payload jsonb not null,
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz not null default now(), captured_by uuid not null references auth.users(id),
  primary key(company_id,entity_type,entity_id,revision),
  foreign key(company_id,entity_type,entity_id) references azzora.records(company_id,entity_type,id)
);
create table azzora.attachments (
  company_id uuid not null, id text not null, entity_type text not null, entity_id text not null,
  bucket_id text not null default 'azzora-private' check(bucket_id='azzora-private'),
  object_key text not null unique,
  mime text not null check(mime in ('application/pdf','image/png','image/jpeg')),
  bytes bigint not null check(bytes>0 and bytes<=10485760),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  scan_status text not null default 'quarantine' check(scan_status in ('quarantine','clean','rejected')),
  primary key(company_id,id),
  foreign key(company_id,entity_type,entity_id) references azzora.records(company_id,entity_type,id),
  check(object_key like company_id::text || '/%')
);
create table azzora.policy_approvals (
  company_id uuid not null references azzora.companies(id), policy_key text not null,
  version text not null, approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null, evidence_reference text not null,
  primary key(company_id,policy_key)
);
create table azzora.accounting_periods (
  company_id uuid not null references azzora.companies(id), id text not null,
  start_date date not null, end_date date not null, locked boolean not null default true,
  primary key(company_id,id), check(end_date>=start_date)
);
create table azzora.accounts (
  company_id uuid not null references azzora.companies(id), id text not null,
  code text not null, name text not null,
  type text not null check(type in ('Asset','Liability','Equity','Income','Cost of Sales','Expense')),
  postable boolean not null default false, active boolean not null default false,
  primary key(company_id,id), unique(company_id,code)
);
create table azzora.journals (
  company_id uuid not null, id text not null, posting_key text not null,
  source_type text not null, source_id text not null, source_action text not null,
  posting_date date not null, period_id text not null, memo text not null,
  currency text not null check(currency='AED'),
  created_in xid8 not null default pg_current_xact_id(),
  recorded_at timestamptz not null default now(), actor_id uuid not null references auth.users(id),
  primary key(company_id,id), unique(company_id,posting_key),
  unique(company_id,source_type,source_id,source_action),
  foreign key(company_id,period_id) references azzora.accounting_periods(company_id,id),
  foreign key(company_id,source_type,source_id) references azzora.records(company_id,entity_type,id)
);
create table azzora.journal_lines (
  company_id uuid not null, journal_id text not null, line_no integer not null check(line_no>0),
  account_id text not null, debit_fils numeric not null default 0,
  credit_fils numeric not null default 0, project_id text, party_id text, department_id text,
  primary key(company_id,journal_id,line_no),
  foreign key(company_id,journal_id) references azzora.journals(company_id,id),
  foreign key(company_id,account_id) references azzora.accounts(company_id,id),
  foreign key(company_id,project_id) references azzora.projects(company_id,id),
  foreign key(company_id,party_id) references azzora.parties(company_id,id),
  foreign key(company_id,department_id) references azzora.departments(company_id,id),
  check(debit_fils=trunc(debit_fils) and credit_fils=trunc(credit_fils)
    and debit_fils<1e24 and credit_fils<1e24
    and debit_fils>=0 and credit_fils>=0 and ((debit_fils>0)<>(credit_fils>0)))
);
create table azzora.allocations (
  company_id uuid not null, id text not null, settlement_type text not null,
  settlement_id text not null, document_type text not null, document_id text not null,
  amount_fils numeric not null check(amount_fils=trunc(amount_fils) and amount_fils>0 and amount_fils<1e24),
  journal_id text not null, primary key(company_id,id),
  foreign key(company_id,settlement_type,settlement_id) references azzora.records(company_id,entity_type,id),
  foreign key(company_id,document_type,document_id) references azzora.records(company_id,entity_type,id),
  foreign key(company_id,journal_id) references azzora.journals(company_id,id)
);
create table azzora.audit_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references azzora.companies(id), actor_id uuid not null references auth.users(id),
  action text not null, entity_type text not null, entity_id text not null,
  request_id text not null, recorded_at timestamptz not null default now(), metadata jsonb not null default '{}'
);
create index audit_company_time on azzora.audit_events(company_id,recorded_at);
create table azzora.command_receipts (
  company_id uuid not null references azzora.companies(id), idempotency_key text not null,
  request_sha256 text not null check(request_sha256 ~ '^[a-f0-9]{64}$'),
  actor_id uuid not null references auth.users(id), result jsonb not null,
  created_at timestamptz not null default now(), primary key(company_id,idempotency_key)
);
create table azzora.migration_batches (
  company_id uuid not null references azzora.companies(id), id text not null,
  source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
  manifest jsonb not null, status text not null check(status in ('rehearsal','reconciled','approved','imported')),
  primary key(company_id,id), unique(company_id,source_sha256)
);

-- Helper runs as schema owner solely for membership lookup, avoiding recursive
-- membership RLS. It is private, not callable by anon/authenticated, and checks
-- auth.uid(), current membership, current app session and provider session.
create function azzora.can_access(p_company uuid,p_finance boolean default false,p_project text default null)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from azzora.memberships m
  join azzora.sessions s on s.company_id=m.company_id and s.user_id=m.user_id
  join auth.sessions ps on ps.id=s.provider_session_id and ps.user_id=s.user_id
  where m.company_id=p_company and m.user_id=auth.uid() and m.active
    and s.revoked_at is null and s.expires_at>now()
    and s.token_hash=current_setting('azzora.session_token_hash',true)
    and (m.role not in ('owner_admin','accountant') or s.assurance='aal2')
    and (not p_finance or (m.finance_access and m.role in ('owner_admin','accountant') and s.assurance='aal2'))
    and (m.role not in ('site_staff','project_manager') or (p_project is not null and exists (
      select 1 from azzora.project_assignments a where a.company_id=m.company_id
        and a.user_id=m.user_id and a.project_id=p_project and a.active)))
 );
$$;
revoke all on function azzora.can_access(uuid,boolean,text) from public,anon,authenticated;
grant execute on function azzora.can_access(uuid,boolean,text) to azzora_api;

create function azzora.can_read_operations(p_company uuid,p_type text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from azzora.memberships m where m.company_id=p_company
  and m.user_id=auth.uid() and m.active and (m.role in ('owner_admin','project_manager')
    or (m.role='site_staff' and p_type in ('task','phase','milestone','document','site_update','snag','handover','assignment','planning'))));
$$;
revoke all on function azzora.can_read_operations(uuid,text) from public,anon,authenticated;
grant execute on function azzora.can_read_operations(uuid,text) to azzora_api;

-- No client/table mutation grants. SQL functions are called only by the trusted
-- server role after validating provider identity and establishing session context.
do $$ declare t text; begin
 foreach t in array array['companies','memberships','sessions','parties','departments','projects',
  'project_assignments','records','snapshots','attachments','policy_approvals','accounting_periods',
  'accounts','journals','journal_lines','allocations','audit_events','command_receipts','migration_batches'] loop
  execute format('alter table azzora.%I enable row level security',t);
  execute format('revoke all on azzora.%I from public,anon,authenticated,azzora_api',t);
 end loop;
end $$;
grant select on azzora.parties,azzora.departments,azzora.projects,azzora.records,
 azzora.snapshots,azzora.attachments,azzora.accounts,azzora.accounting_periods,
 azzora.journals,azzora.journal_lines,azzora.allocations to azzora_api;
create policy party_read on azzora.parties for select to azzora_api using(azzora.can_access(company_id));
create policy department_read on azzora.departments for select to azzora_api using(azzora.can_access(company_id));
create policy project_read on azzora.projects for select to azzora_api using(azzora.can_access(company_id,false,id));
create policy record_read on azzora.records for select to azzora_api using(
 azzora.can_access(company_id,entity_type in ('sales_invoice','supplier_bill','receipt','supplier_payment','expense','cash_account','transfer','expense_ledger','credit_note','refund'),project_id)
 and (entity_type in ('sales_invoice','supplier_bill','receipt','supplier_payment','expense','cash_account','transfer','expense_ledger','credit_note','refund')
   or azzora.can_read_operations(company_id,entity_type)));
create policy snapshot_read on azzora.snapshots for select to azzora_api using(exists(
 select 1 from azzora.records r where r.company_id=snapshots.company_id and r.entity_type=snapshots.entity_type and r.id=snapshots.entity_id));
create policy attachment_read on azzora.attachments for select to azzora_api using(scan_status='clean' and exists(
 select 1 from azzora.records r where r.company_id=attachments.company_id and r.entity_type=attachments.entity_type and r.id=attachments.entity_id));
do $$ declare t text; begin
 foreach t in array array['accounts','accounting_periods','journals','journal_lines','allocations'] loop
 execute format('create policy finance_read on azzora.%I for select to azzora_api using(azzora.can_access(company_id,true))',t);
 end loop;
end $$;

create function azzora.reject_history_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Immutable history: append an approved reversal or new revision' using errcode='23514'; end $$;
revoke all on function azzora.reject_history_mutation() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['snapshots','journals','journal_lines','allocations','audit_events','command_receipts'] loop
 execute format('create trigger immutable_history before update or delete on azzora.%I for each row execute function azzora.reject_history_mutation()',t);
 end loop;
end $$;

-- An unbalanced or empty journal cannot commit, even through an internal tool.
create function azzora.assert_journal_balance() returns trigger language plpgsql set search_path='' as $$
declare c uuid; j text; n bigint; d numeric; v numeric;
begin
 c:=new.company_id; if tg_table_name='journals' then j:=new.id; else j:=new.journal_id; end if;
 select count(*),coalesce(sum(debit_fils),0),coalesce(sum(credit_fils),0) into n,d,v
 from azzora.journal_lines where company_id=c and journal_id=j;
 if n<2 or d<=0 or d<>v then raise exception 'Journal must have at least two balanced lines' using errcode='23514'; end if;
 return null;
end $$;
revoke all on function azzora.assert_journal_balance() from public,anon,authenticated;
create constraint trigger journal_balanced after insert on azzora.journals
 deferrable initially deferred for each row execute function azzora.assert_journal_balance();
create constraint trigger journal_lines_balanced after insert on azzora.journal_lines
 deferrable initially deferred for each row execute function azzora.assert_journal_balance();

-- A journal and all its lines are created in one transaction. A later balanced
-- pair of inserts would otherwise silently rewrite issued journal history.
create function azzora.check_new_journal_line() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from azzora.journals j where j.company_id=new.company_id
  and j.id=new.journal_id and j.created_in=pg_current_xact_id()) then
  raise exception 'Cannot append lines to an already committed journal' using errcode='23514';
 end if;
 if not exists(select 1 from azzora.accounts a where a.company_id=new.company_id
  and a.id=new.account_id and a.active and a.postable) then
  raise exception 'Journal account must be active and postable' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function azzora.check_new_journal_line() from public,anon,authenticated;
create trigger journal_line_admission before insert on azzora.journal_lines
 for each row execute function azzora.check_new_journal_line();

create function azzora.check_new_journal_period() returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from azzora.accounting_periods p where p.company_id=new.company_id
  and p.id=new.period_id and not p.locked and new.posting_date between p.start_date and p.end_date for share;
 if not found then raise exception 'Posting requires an open matching accounting period' using errcode='23514'; end if;
 if new.created_in<>pg_current_xact_id() then
  raise exception 'Journal transaction identity mismatch' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function azzora.check_new_journal_period() from public,anon,authenticated;
create trigger journal_period_admission before insert on azzora.journals
 for each row execute function azzora.check_new_journal_period();

-- No financial write RPC is granted in this first migration: policy approvals,
-- server/domain command validation and atomic document+allocation+journal RPC
-- must pass staging acceptance before an authoritative write path is enabled.
-- No real buckets, identities, opening balances, policy approvals or fixtures seeded.
commit;
