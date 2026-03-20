-- CreateEnum
CREATE TYPE "plan_enum" AS ENUM ('free', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "role_enum" AS ENUM ('super_admin', 'tenant_admin', 'analyst', 'viewer', 'api_only');

-- CreateEnum
CREATE TYPE "auth_provider_enum" AS ENUM ('email', 'google', 'saml', 'oidc');

-- CreateEnum
CREATE TYPE "feed_type_enum" AS ENUM ('stix', 'taxii', 'misp', 'rss', 'rest_api', 'nvd', 'csv_upload', 'json_upload', 'webhook', 'email_imap');

-- CreateEnum
CREATE TYPE "feed_status_enum" AS ENUM ('active', 'paused', 'error', 'disabled');

-- CreateEnum
CREATE TYPE "ioc_type_enum" AS ENUM ('ip', 'ipv6', 'domain', 'fqdn', 'url', 'email', 'hash_md5', 'hash_sha1', 'hash_sha256', 'hash_sha512', 'cve', 'asn', 'cidr', 'bitcoin_address', 'unknown');

-- CreateEnum
CREATE TYPE "ioc_lifecycle_enum" AS ENUM ('new', 'active', 'aging', 'expired', 'archived', 'false_positive', 'revoked');

-- CreateEnum
CREATE TYPE "severity_enum" AS ENUM ('info', 'low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "tlp_enum" AS ENUM ('white', 'green', 'amber', 'red');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "plan" "plan_enum" NOT NULL DEFAULT 'free',
    "max_users" INTEGER NOT NULL DEFAULT 5,
    "max_feeds_per_day" INTEGER NOT NULL DEFAULT 10,
    "max_iocs" INTEGER NOT NULL DEFAULT 10000,
    "ai_credits_monthly" INTEGER NOT NULL DEFAULT 100,
    "ai_credits_used" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "avatar_url" TEXT,
    "role" "role_enum" NOT NULL DEFAULT 'viewer',
    "auth_provider" "auth_provider_enum" NOT NULL DEFAULT 'email',
    "auth_provider_id" VARCHAR(255),
    "password_hash" VARCHAR(255),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" VARCHAR(255),
    "last_login_at" TIMESTAMP(3),
    "login_count" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "prefix" VARCHAR(12) NOT NULL,
    "key_hash" VARCHAR(255) NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['ioc:read']::TEXT[],
    "last_used" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(255) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(255),
    "changes" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "feed_type" "feed_type_enum" NOT NULL,
    "url" TEXT,
    "schedule" VARCHAR(100),
    "headers" JSONB NOT NULL DEFAULT '{}',
    "auth_config" JSONB NOT NULL DEFAULT '{}',
    "parse_config" JSONB NOT NULL DEFAULT '{}',
    "status" "feed_status_enum" NOT NULL DEFAULT 'active',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_fetch_at" TIMESTAMP(3),
    "last_error_at" TIMESTAMP(3),
    "last_error_message" TEXT,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "total_items_ingested" INTEGER NOT NULL DEFAULT 0,
    "items_ingested_24h" INTEGER NOT NULL DEFAULT 0,
    "items_relevant_24h" INTEGER NOT NULL DEFAULT 0,
    "avg_processing_time_ms" INTEGER NOT NULL DEFAULT 0,
    "feed_reliability" INTEGER NOT NULL DEFAULT 50,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iocs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "feed_source_id" UUID,
    "ioc_type" "ioc_type_enum" NOT NULL,
    "value" TEXT NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "dedupe_hash" VARCHAR(64) NOT NULL,
    "severity" "severity_enum" NOT NULL DEFAULT 'medium',
    "tlp" "tlp_enum" NOT NULL DEFAULT 'amber',
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "lifecycle" "ioc_lifecycle_enum" NOT NULL DEFAULT 'new',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mitre_attack" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "malware_families" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "threat_actors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enrichment_data" JSONB,
    "enriched_at" TIMESTAMP(3),
    "first_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iocs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_idx" ON "sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "api_keys_tenant_id_idx" ON "api_keys"("tenant_id");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "api_keys_prefix_idx" ON "api_keys"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_tenant_id_name_key" ON "api_keys"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "feed_sources_tenant_id_idx" ON "feed_sources"("tenant_id");

-- CreateIndex
CREATE INDEX "feed_sources_status_idx" ON "feed_sources"("status");

-- CreateIndex
CREATE INDEX "feed_sources_feed_type_idx" ON "feed_sources"("feed_type");

-- CreateIndex
CREATE UNIQUE INDEX "iocs_dedupe_hash_key" ON "iocs"("dedupe_hash");

-- CreateIndex
CREATE INDEX "iocs_tenant_id_idx" ON "iocs"("tenant_id");

-- CreateIndex
CREATE INDEX "iocs_tenant_id_ioc_type_idx" ON "iocs"("tenant_id", "ioc_type");

-- CreateIndex
CREATE INDEX "iocs_tenant_id_severity_idx" ON "iocs"("tenant_id", "severity");

-- CreateIndex
CREATE INDEX "iocs_tenant_id_lifecycle_idx" ON "iocs"("tenant_id", "lifecycle");

-- CreateIndex
CREATE INDEX "iocs_normalized_value_idx" ON "iocs"("normalized_value");

-- CreateIndex
CREATE INDEX "iocs_first_seen_idx" ON "iocs"("first_seen");

-- CreateIndex
CREATE INDEX "iocs_last_seen_idx" ON "iocs"("last_seen");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_sources" ADD CONSTRAINT "feed_sources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iocs" ADD CONSTRAINT "iocs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iocs" ADD CONSTRAINT "iocs_feed_source_id_fkey" FOREIGN KEY ("feed_source_id") REFERENCES "feed_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

