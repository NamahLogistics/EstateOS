# Estate OS

Family continuity after death or incapacity — Life Map, unlock rules, Execution Mode, counsel retain & brief.

**Live:** https://estate-os-production.up.railway.app  
**Repo:** https://github.com/NamahLogistics/EstateOS

## Product

- Life Map vault (banks, insurance, property, digital, wishes)
- Unlock rules (single / dual) + proof upload
- India Execution Mode + claim letters
- Counsel directory, retain, legal pathway, privileged matter room
- Sibling invite links · ZIP export · audit trail
- Terms / Privacy included in-app

## Local

```bash
npm install
npm run dev
```

- Web: http://localhost:5178  
- API: http://localhost:4060  

## Production (Railway)

1. Add Postgres: `railway add --database postgres`
2. Variables on the web service:
   - `JWT_SECRET` (strong random)
   - `DATABASE_URL` (from Postgres plugin / reference)
   - `APP_URL=https://estate-os-production.up.railway.app`
   - `NODE_ENV=production`
3. `npm run build` + `npm start` (configured in `railway.toml`)

Without `DATABASE_URL`, data is file-backed and **not durable** across deploys.

## Counsel directory

Verified starter advocates are seeded for matching. Families can also request any listed counsel.
