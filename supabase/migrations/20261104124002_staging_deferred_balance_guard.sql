-- Deferred constraint triggers run at transaction completion, after the public
-- SECURITY DEFINER command has restored the calling service role. The caller
-- deliberately has no direct access to the private schema. Run only this
-- read-only balance guard as its owning role; preserve its fully qualified
-- relations, empty search path, checks, and closed EXECUTE grants.
begin;
alter function azzora.assert_journal_balance() security definer;
revoke all on function azzora.assert_journal_balance() from public,anon,authenticated,service_role,azzora_api;
commit;
