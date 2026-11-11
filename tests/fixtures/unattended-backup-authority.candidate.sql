-- ISOLATED TEST CANDIDATE ONLY. Never apply this file to a hosted database.
-- Prerequisite: azzora_backup_executor exists as a NOLOGIN, narrowly granted role.
-- The release migration, owner-MFA grant provisioning, and revocation channel
-- must be designed and independently reviewed before deployment.
create schema azzora_backup_candidate;
revoke all on schema azzora_backup_candidate from public;
grant usage on schema azzora_backup_candidate to azzora_backup_executor;

create table azzora_backup_candidate.grants (
 id uuid primary key, company_id uuid not null, credential_hash text not null check (credential_hash ~ '^[0-9a-f]{64}$'),
 capability text not null check (capability='backup.capture'), expires_at timestamptz not null,
 revoked_at timestamptz, created_at timestamptz not null default clock_timestamp()
);
create table azzora_backup_candidate.runs (
 request_id uuid primary key, grant_id uuid not null references azzora_backup_candidate.grants(id),
 company_id uuid not null, started_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz, outcome text check (outcome in ('success','failure','denied'))
);
create table azzora_backup_candidate.audit (
 id bigint generated always as identity primary key, request_id uuid not null,
 grant_id uuid not null, company_id uuid not null, event text not null check (event in ('start','success','failure','denied')),
 occurred_at timestamptz not null default clock_timestamp()
);
revoke all on all tables in schema azzora_backup_candidate from public, azzora_backup_executor;
revoke all on all sequences in schema azzora_backup_candidate from public, azzora_backup_executor;

create function azzora_backup_candidate.begin_capture(p_company uuid,p_grant uuid,p_request uuid,p_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare g azzora_backup_candidate.grants%rowtype;
begin
 select * into g from azzora_backup_candidate.grants where id=p_grant for update;
 if not found or g.company_id is distinct from p_company or g.credential_hash is distinct from p_hash
    or g.capability <> 'backup.capture' or g.revoked_at is not null or g.expires_at<=clock_timestamp()
 then return false; end if;
 insert into azzora_backup_candidate.runs(request_id,grant_id,company_id)
 values(p_request,p_grant,p_company) on conflict(request_id) do nothing;
 if not found then return false; end if;
 insert into azzora_backup_candidate.audit(request_id,grant_id,company_id,event)
 values(p_request,p_grant,p_company,'start');
 return true;
end $$;

create function azzora_backup_candidate.finish_capture(p_company uuid,p_grant uuid,p_request uuid,p_hash text,p_outcome text)
returns boolean language plpgsql security definer set search_path='' as $$
declare g azzora_backup_candidate.grants%rowtype; r azzora_backup_candidate.runs%rowtype; v_outcome text;
begin
 if p_outcome not in ('success','failure') then return false; end if;
 select * into g from azzora_backup_candidate.grants where id=p_grant for update;
 if not found or g.company_id is distinct from p_company or g.credential_hash is distinct from p_hash then return false; end if;
 select * into r from azzora_backup_candidate.runs where request_id=p_request and grant_id=p_grant and company_id=p_company for update;
 if not found or r.finished_at is not null then return false; end if;
 v_outcome:=case when g.revoked_at is not null or g.expires_at<=clock_timestamp() then 'denied' else p_outcome end;
 update azzora_backup_candidate.runs set finished_at=clock_timestamp(),outcome=v_outcome where request_id=p_request;
 insert into azzora_backup_candidate.audit(request_id,grant_id,company_id,event) values(p_request,p_grant,p_company,v_outcome);
 return v_outcome='success';
end $$;
revoke all on function azzora_backup_candidate.begin_capture(uuid,uuid,uuid,text) from public;
revoke all on function azzora_backup_candidate.finish_capture(uuid,uuid,uuid,text,text) from public;
grant execute on function azzora_backup_candidate.begin_capture(uuid,uuid,uuid,text) to azzora_backup_executor;
grant execute on function azzora_backup_candidate.finish_capture(uuid,uuid,uuid,text,text) to azzora_backup_executor;
