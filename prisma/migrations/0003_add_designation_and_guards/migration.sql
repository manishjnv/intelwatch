-- I-03: Add designation field to users table
ALTER TABLE "users" ADD COLUMN "designation" VARCHAR(50);

-- I-04: Defense-in-depth DB trigger — prevent tenant_admin deletion
CREATE OR REPLACE FUNCTION prevent_tenant_admin_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'tenant_admin' THEN
    RAISE EXCEPTION 'tenant_admin accounts cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guard_tenant_admin_delete
BEFORE DELETE ON "users"
FOR EACH ROW EXECUTE FUNCTION prevent_tenant_admin_delete();
