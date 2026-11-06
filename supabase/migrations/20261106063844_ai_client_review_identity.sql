-- Add one explicitly authorized fictional client-review identity only.
-- Existing fixture identities, memberships, records and Auth settings are untouched.
begin;
create or replace function public.staging_auth_grant(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform azzora.assert_synthetic_staging();
 select jsonb_build_object('userId',m.user_id,'companyId',m.company_id,'role',m.role,
 'email',u.email,'personId',m.user_id,'workspaces',m.workspaces,'capabilities',m.capabilities)
 into result from azzora.memberships m
 join auth.users u on u.id=m.user_id
 join azzora.companies c on c.id=m.company_id
 where m.user_id=p_user_id
 and m.company_id='11111111-1111-4111-8111-111111111111'::uuid
 and c.data_mode='fictional-staging' and m.active
 and (
   (u.id<>'52f925bd-8744-48cc-8781-d20109387d14'::uuid
    and u.email in ('owner@staging.azzora.test','manager@staging.azzora.test',
                   'accountant@staging.azzora.test','engineer@staging.azzora.test'))
   or (
     u.id='52f925bd-8744-48cc-8781-d20109387d14'::uuid
     and u.email='client-review@staging.azzora.test'
     and u.raw_app_meta_data->>'azzora_purpose'='client-review-draft-only'
     and m.role='accountant' and m.finance_access
     and m.workspaces=array['accountant']::text[]
     and m.capabilities @> array['finance.read','finance.draft']::text[]
     and m.capabilities <@ array['finance.read','finance.draft']::text[]
     and cardinality(m.capabilities)=2
   )
 )
 and u.email_confirmed_at is not null
 and u.raw_app_meta_data->>'azzora_scope'='fictional-staging'
 and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false
 and (nullif(to_jsonb(u)->>'banned_until','')::timestamptz is null
      or nullif(to_jsonb(u)->>'banned_until','')::timestamptz<now());
 if result is null then
   raise exception 'Staging membership denied' using errcode='PT403';
 end if;
 return result;
end $$;
revoke all on function public.staging_auth_grant(uuid) from public,anon,authenticated,azzora_api;
grant execute on function public.staging_auth_grant(uuid) to service_role;
commit;
