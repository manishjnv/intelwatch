# S147 security: included inside every /api/v1/* location that nginx proxies straight to a
# backend service (not through the api-gateway). The gateway validates the access JWT; nginx
# then OVERWRITES the identity headers the services trust, so clients can never choose them.
# (.inc — not auto-included by nginx.conf's conf.d/*.conf glob.)
auth_request /_etip_auth;
auth_request_set $etip_auth_tenant $upstream_http_x_auth_tenant_id;
auth_request_set $etip_auth_user   $upstream_http_x_auth_user_id;
auth_request_set $etip_auth_role   $upstream_http_x_auth_role;
proxy_set_header x-tenant-id $etip_auth_tenant;
proxy_set_header x-user-id   $etip_auth_user;
proxy_set_header x-user-role $etip_auth_role;
