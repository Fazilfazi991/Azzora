# Staging backup schema baseline

The staging v3 encrypted archive includes a versioned copy of the reviewed source migrations. The restore checks their count, order, names and SHA-256 values against a separately trusted compiled catalog before executing archive bytes. Unknown bundles fail closed. The v2 format remains readable, but it does not contain migrations and cannot meet archive-only schema recovery.

The bundle is a **reviewed source baseline**, not a capture or proof of the live database schema. Hosted manual changes and unrecorded migration history can make it incomplete. A matching business-data restore does not establish a complete infrastructure or application restore. No live-schema match is claimed; restore reports `liveSchemaVerified: false`. Do not use this baseline as a production disaster-recovery artifact.

Preserve the exact verified restore tool and its trusted catalog alongside each backup. When migrations change, retain every historical catalog entry, add a separately reviewed new version, and update the build check. Never silently overwrite an old catalog entry. Builds fail when the current reviewed baseline differs from repository migrations; a new version requires deliberate code and test review. Secrets, Auth credentials and MFA material are excluded.
