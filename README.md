# Estate OS

Family continuity after death or incapacity.

Adult children build a parent’s **Life Map**, set **unlock rules**, then run **Execution Mode** (India checklist + claim letters) when something happens.

## Run

```bash
npm install
npm run dev
```

- Web: http://localhost:5177  
- API: http://localhost:4060  

## Demo path

1. Register an account  
2. Create an estate for a parent  
3. Click **Load India demo items**  
4. Set unlock rules  
5. Upload any file as “death certificate” → Unlock  
6. Work Execution Mode + download letters  

## Counsel layer

- Directory of verified demo advocates (filter by city / specialty / NRI)
- Engage with scope + conflict ack → counsel accepts on **Counsel desk**
- Auto **legal pathway** (India succession intelligence)
- Auto **Counsel Brief** download for the matter
- Privileged notes, legal action board, “needs from family”
- One-click demo retain: Adv. Kavita Mehta

## Deploy

Railway (recommended): connected GitHub repo, build `npm install && npm run build`, start `npm start`.

Set env:
- `JWT_SECRET` — long random string
- `NODE_ENV=production`

Demo counsel after deploy: `advocate.mehta@estateos.dev` / `counsel12`

Note: JSON file storage is ephemeral on Railway unless you attach a volume — fine for demo.

