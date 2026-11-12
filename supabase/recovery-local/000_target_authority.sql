-- Isolated fictional target bootstrap. The target administrator supplies the
-- independently verified operator and pinned local service identifiers later.
begin;
do $$ begin
 if current_database() !~ '^azzora_recovery_[a-z0-9_]+$' then raise exception 'Not an isolated recovery database'; end if;
 perform azzora.assert_synthetic_staging();
end $$;
create schema azzora_recovery_control;
revoke all on schema azzora_recovery_control from public,anon,authenticated,service_role,azzora_api;
create table azzora_recovery_control.authority (
 target_id uuid primary key, operator_id uuid not null references auth.users(id),
 active boolean not null default false, seal_key bytea not null check(octet_length(seal_key)=32),
 auth_container_id text not null check(auth_container_id ~ '^[a-f0-9]{64}$'),
 db_container_id text not null check(db_container_id ~ '^[a-f0-9]{64}$'),
 storage_container_id text not null check(storage_container_id ~ '^[a-f0-9]{64}$'),
 auth_port text not null, db_port text not null, storage_port text not null,
 database_name text not null check(database_name=current_database())
);
revoke all on azzora_recovery_control.authority from public,anon,authenticated,service_role,azzora_api;
commit;
