# VPS acceptance scripts (Step 3 persistence)

Run the compiled service code inside its production container against the real Postgres —
the in-memory test repos cannot catch key collisions or Prisma runtime errors (RCA #68).
Each script uses a throwaway tenant `00000000-0000-4177-8177-000000000177` and has a
`cleanup` mode; always run it.

```bash
# from a machine with the Cloudflare tunnel (see CLAUDE.md "VPS SSH Access")
SSH='ssh -o ProxyCommand="cloudflared access ssh --hostname ssh.intelwatch.in" root@ssh.intelwatch.in'
eval $SSH "'docker exec -i -e MODE=seed    etip_alerting node --input-type=module -'" < scripts/vps-acceptance/s177-alerting.mjs
eval $SSH "'docker restart etip_alerting'"          # then:
eval $SSH "'docker exec -i -e MODE=check   etip_alerting node --input-type=module -'" < scripts/vps-acceptance/s177-alerting.mjs
eval $SSH "'docker exec -i -e MODE=cleanup etip_alerting node --input-type=module -'" < scripts/vps-acceptance/s177-alerting.mjs
```

- `s177-alerting.mjs` — rule + two identical jobs through the real `bull` queue → expect 1 alert, `dedupCount` 2, 1 history row, 1 group.
- `s177-integration.mjs` — TAXII collection + objects doc with the same id both survive; foreign-tenant save → 409; log row; `MODE=export` → real IOCs, no demo values.
- `s177-drp.mjs` — asset persisted; foreign-tenant read → null, save → 409.
