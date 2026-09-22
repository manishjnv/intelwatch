# S147 security: like service-auth.inc, but only super_admin tokens pass (403 otherwise).
# Used for admin-ops, billing admin, cache and archive locations.
auth_request /_etip_auth_super_admin;
auth_request_set $etip_auth_tenant $upstream_http_x_auth_tenant_id;
auth_request_set $etip_auth_user   $upstream_http_x_auth_user_id;
auth_request_set $etip_auth_role   $upstream_http_x_auth_role;
proxy_set_header x-tenant-id $etip_auth_tenant;
proxy_set_header x-user-id   $etip_auth_user;
proxy_set_header x-user-role $etip_auth_role;
