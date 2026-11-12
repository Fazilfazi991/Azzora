# Connected application recovery — 12 November 2026

Local fictional target only: `azzora_recovery_loopback`, target UUID
`92703015-ddb2-47ad-80f3-897990315eb7`. Used the unchanged archive actually
downloaded from hosted source `ae9d8c9c357cfa2235143c8187a60d158473b698`:
SHA256 `2603ecab3d69be0837f342ce382aeca8506b42b3128cdbe24ec6dc7b9bd63fcd`.
The verified v3 archive contains its reviewed 12-migration bundle. All matching
migrations were applied before successful connected recovery. No fixture
replaced the downloaded archive.

The existing CLI `recover-local-application` completed with one restored private
original and two approved replacement memberships. The replacement UUIDs are
the Owner-approved fictional mappings; the authenticated local recovery operator
had verified fresh MFA. The approval receipt bound the archive, target,
containers, ports and UUID pairs. No missing recovered membership was seeded
outside the recovery procedure.

Executed acceptance against real local GoTrue, PostgreSQL and private Storage
using the actual `createStagingHandler` BFF:

| Check | Result |
| --- | --- |
| Recovered Owner and Accountant password login + fresh MFA enrollment | 2/2 PASS |
| Pre-MFA session/snapshot/file/command access denied | 8/8 PASS |
| Real AAL1 provider session falsely presented as AAL2 denied | 2/2 PASS |
| Correct company snapshots include archived invoice | 2/2 PASS |
| Authenticated private original download SHA matches archive | 2/2 PASS |
| Known existing foreign-company original denied | 2/2 PASS |
| Foreign-company session, changed archived role/capabilities, revoked authority | 6/6 PASS |
| Canonical business data identical; six journals reconcile | PASS |
| Trial Balance/Balance Sheet balanced; P&L and other report values match | PASS |
| Original audit actor references unchanged | 86/86 PASS |

Four historical memberships are restored inactive and three original project
assignments remain associated with their original disabled identities. Only the
two explicitly mapped Owner/Accountant replacements are activated. Replacement
Staff/Manager access was not claimed or tested.

Actual failures repaired during execution: historical assignments referenced
memberships that had not been restored (FK23503); the SQL restore unconditionally
referenced an optional reversal column; the earlier local target had only six
of the required twelve migrations. Fixed the restore relationships, explicit
schema handling, completed the required baseline, and reran the real CLI.
Missing private Storage service grants were corrected only in the isolated
service baseline. An unavailable bucket now fails before business restoration.

Separate independent privacy tests rejected malformed context/UUID/authority
requests and found no sentinel in driver or database logs (3/3). Node digest and
nonlocal-target tests pass2/2. These checks do not establish a later hosted
candidate, full Supabase platform cloning or production accounting readiness.
No hosted database, live alias or paid provider was changed by this recovery.
