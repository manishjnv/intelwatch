-- Step 1: Migrate stranded users BEFORE enum change
UPDATE "etip_user" SET "role" = 'analyst' WHERE "role" IN ('viewer', 'api_only');

-- Step 2: Recreate role_enum with only 3 values
-- Prisma can't drop enum values natively, so we must:
--   1. Create new enum
--   2. Alter column to use new enum (via text cast)
--   3. Drop old enum
--   4. Rename new enum to original name

CREATE TYPE "role_enum_new" AS ENUM ('super_admin', 'tenant_admin', 'analyst');

ALTER TABLE "etip_user"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "role_enum_new" USING ("role"::text::"role_enum_new"),
  ALTER COLUMN "role" SET DEFAULT 'analyst';

DROP TYPE "role_enum";

ALTER TYPE "role_enum_new" RENAME TO "role_enum";
