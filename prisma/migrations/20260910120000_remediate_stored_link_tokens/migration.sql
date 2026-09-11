-- REMEDIATION: single-use links stored in notification records
--
-- Before this release, registration, password reset and organization invites
-- passed the full link (with its single-use token) as notification `data`,
-- and `data` is persisted on every delivery record. Anyone with read access to
-- `notification_records` could therefore obtain working verification links,
-- password-reset links (account takeover) and invitation links.
--
-- The code now sends these as transient data that is never stored. This
-- migration cleans up what was already written:
--
-- 1. Remove the link fields from every stored notification payload.
-- 2. Invalidate every outstanding single-use token of the affected kinds, so a
--    link that may have been read from the table no longer works. The owners
--    simply request a new one; nothing else about their accounts changes.
-- 3. Revoke pending invitations issued before this release for the same
--    reason; administrators re-send them.

UPDATE "notification_records"
SET "data" = "data" - 'verifyUrl' - 'resetUrl' - 'inviteUrl'
WHERE "data" IS NOT NULL
  AND ("data" ? 'verifyUrl' OR "data" ? 'resetUrl' OR "data" ? 'inviteUrl');

UPDATE "verification_tokens"
SET "consumedAt" = now()
WHERE "consumedAt" IS NULL
  AND "type" IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'MAGIC_LINK');

UPDATE "invitations"
SET "status" = 'REVOKED', "revokedAt" = now()
WHERE "status" = 'PENDING';
