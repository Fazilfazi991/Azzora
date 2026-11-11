-- REVIEW ONLY. Do not execute on a live or production project.
-- Adds exactly one EMPTY fictional staging company and four constrained test
-- memberships. No production configuration, RLS policy or function ACL changes.
-- The caller must separately create the four fictional confirmed Auth accounts
-- with the trusted app_metadata scope and purpose checked below. Never invite a
-- real person or put credentials in this SQL.
begin;
do $outer$
declare
  before_definition text;
  after_definition text;
  original_acl aclitem[];
  original_definer boolean;
  original_config text[];
  marker constant text := ' perform azzora.assert_synthetic_staging();';
  names constant text[] := array[
    'company-b-owner@staging.azzora.test',
    'company-b-manager@staging.azzora.test',
    'company-b-accountant@staging.azzora.test',
    'company-b-engineer@staging.azzora.test'];
  ids constant uuid[] := array[
    '00000011-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    '00000012-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    '00000013-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
    '00000014-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid];
begin
  perform azzora.assert_synthetic_staging();
  if not exists (select 1 from azzora.environment_config
    where project_ref='hkhomrrvxtcxnxvdlkoh' and environment='synthetic-staging'
      and not real_financial_posting_enabled and not real_document_processing_enabled)
  then raise exception 'Expected authorized fictional staging only'; end if;
  if exists(select 1 from azzora.companies where id='4b44d384-fbbd-44f3-91fc-abd3ff89a19f')
  then raise exception 'Company B already exists; inspect instead of overwriting'; end if;
  if (select count(*) from auth.users u where u.email=any(names)
      and u.id=ids[array_position(names,u.email)]
      and u.email_confirmed_at is not null
      and u.raw_app_meta_data->>'azzora_scope'='fictional-staging'
      and u.raw_app_meta_data->>'azzora_purpose'='isolated-company-b-security-test'
      and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false
      and (nullif(to_jsonb(u)->>'banned_until','')::timestamptz is null
           or nullif(to_jsonb(u)->>'banned_until','')::timestamptz<now())) <> 4
     or (select count(distinct u.email) from auth.users u where u.email=any(names)) <> 4
  then raise exception 'Four confirmed, explicitly marked fictional users are required'; end if;
  if exists(select 1 from azzora.memberships m join auth.users u on u.id=m.user_id where u.email=any(names))
  then raise exception 'Company B test identities already have memberships'; end if;
  select pg_get_functiondef(p.oid),p.proacl,p.prosecdef,p.proconfig
    into before_definition,original_acl,original_definer,original_config
  from pg_proc p where p.oid='public.staging_auth_grant(uuid)'::regprocedure;
  if before_definition is null or not original_definer or
     length(before_definition)-length(replace(before_definition,marker,'')) <> length(marker) or
     position('client-review-password-only' in before_definition)=0 or
     position('11111111-1111-4111-8111-111111111111' in before_definition)=0 or
     position('ISOLATED-COMPANY-B-GRANT-V1' in before_definition)>0
  then raise exception 'Unexpected existing grant; no security function was changed'; end if;
  insert into azzora.companies(id,name,data_mode)
    values('4b44d384-fbbd-44f3-91fc-abd3ff89a19f','FICTIONAL SECURITY COMPANY B','fictional-staging');
  insert into azzora.memberships(company_id,user_id,role,active,finance_access,workspaces,capabilities)
  select '4b44d384-fbbd-44f3-91fc-abd3ff89a19f'::uuid,u.id,
    case u.email when names[1] then 'owner_admin' when names[2] then 'project_manager'
      when names[3] then 'accountant' else 'site_staff' end,
    true,u.email in (names[1],names[3]),
    case u.email when names[1] then array['manager','accountant'] when names[3] then array['accountant'] else array['manager'] end,
    case u.email
      when names[1] then array['project.read','project.write','expense.submit','expense.approve','finance.read','finance.draft','finance.simulate','access.manage','task.update','site.submit','document.submit','qa.update']
      when names[2] then array['project.read','project.write','expense.submit','expense.approve','task.update','site.submit','document.submit','qa.update']
      when names[3] then array['finance.read','finance.draft','finance.simulate']
      else array['project.read','expense.submit','task.update','site.submit','document.submit','qa.update'] end
  from auth.users u where u.email=any(names) and u.id=ids[array_position(names,u.email)];
  -- Inject an exact Company B branch before the ORIGINAL Company A query; all
  -- existing statement text, ACLs and the restricted-client exception remain.
  after_definition:=replace(before_definition,marker,marker || $branch$
 -- ISOLATED-COMPANY-B-GRANT-V1: exactly four synthetic memberships only.
 select jsonb_build_object('userId',m.user_id,'companyId',m.company_id,'role',m.role,
   'email',u.email,'personId',m.user_id,'workspaces',m.workspaces,'capabilities',m.capabilities)
 into result from azzora.memberships m join auth.users u on u.id=m.user_id
 join azzora.companies c on c.id=m.company_id
 where m.user_id=p_user_id and m.company_id='4b44d384-fbbd-44f3-91fc-abd3ff89a19f'::uuid
   and c.name='FICTIONAL SECURITY COMPANY B' and c.data_mode='fictional-staging' and m.active
   and c.created_at<=now() and c.created_at>now()-interval '24 hours'
   and u.email_confirmed_at is not null
   and u.raw_app_meta_data->>'azzora_scope'='fictional-staging'
   and u.raw_app_meta_data->>'azzora_purpose'='isolated-company-b-security-test'
   and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false
   and (nullif(to_jsonb(u)->>'banned_until','')::timestamptz is null or nullif(to_jsonb(u)->>'banned_until','')::timestamptz<now())
   and ((u.id='00000011-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid and u.email='company-b-owner@staging.azzora.test' and m.role='owner_admin' and m.finance_access
         and m.workspaces=array['manager','accountant']::text[]
         and m.capabilities=array['project.read','project.write','expense.submit','expense.approve','finance.read','finance.draft','finance.simulate','access.manage','task.update','site.submit','document.submit','qa.update']::text[])
     or (u.id='00000012-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid and u.email='company-b-manager@staging.azzora.test' and m.role='project_manager' and not m.finance_access
         and m.workspaces=array['manager']::text[]
         and m.capabilities=array['project.read','project.write','expense.submit','expense.approve','task.update','site.submit','document.submit','qa.update']::text[])
     or (u.id='00000013-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid and u.email='company-b-accountant@staging.azzora.test' and m.role='accountant' and m.finance_access
         and m.workspaces=array['accountant']::text[]
         and m.capabilities=array['finance.read','finance.draft','finance.simulate']::text[])
     or (u.id='00000014-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid and u.email='company-b-engineer@staging.azzora.test' and m.role='site_staff' and not m.finance_access
         and m.workspaces=array['manager']::text[]
         and m.capabilities=array['project.read','expense.submit','task.update','site.submit','document.submit','qa.update']::text[]));
 if result is not null then return result; end if;
$branch$);
  execute after_definition;
  if exists(select 1 from pg_proc p where p.oid='public.staging_auth_grant(uuid)'::regprocedure
    and (p.proacl is distinct from original_acl or p.prosecdef is distinct from original_definer or p.proconfig is distinct from original_config))
  then raise exception 'Existing function ACL or security attributes changed'; end if;
end $outer$;
commit;
