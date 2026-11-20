# Cronyzo — database down: recovery plan (20 Nov 2026)

## Status right now

- Site khulti hai, crash nahi hoti. Neeche peeli patti: *"Server abhi database se
  connect nahi ho pa raha — aapka data safe hai"*.
- `/api/health/deep` (live) batata hai:

```
status:  degraded
database: error
hint:    Database provider ne plan quota khatam hone par connections band kar diye.
error:   psycopg2.OperationalError … "Your account or project has exceeded the quota.
         Upgrade your plan to increase limits."
```

**Database = Neon (managed Postgres).** Neon ne apni taraf se connection refuse kar
diya hai. Ye provider ka billing limit hai — koi code/server restart ise khol nahi
sakta. **Data delete nahi hua**: books, orders, users, PDFs sab Neon ke andar
surakshit hain, quota khulte hi wapas aa jayenge.

## Jo main abhi kar chuka hoon (takki dobara na ho)

1. Boot crash fix — pehle DB fail = poori site 500. Ab API chalti rehti hai.
2. Banner + `/api/health/deep` — asli wajah aapke phone par dikhti hai.
3. **Quota leak band**: pehle 10 idle connection 24×7 khule rehte the, isliye Neon
   ka "compute time" mahine ka quota 8 din me khatam ho gaya. Ab NullPool — connection
   request ke baad band, database idle me so jata hai (free plan saalon chalega).
4. `scripts/db_copy.py` — ek command me poora data purane DB se naye DB me.
5. `scripts/db_report.py` — kaunsa table kitni jagah kha raha hai (PDF/covers ka MB).

## Option A — Neon upgrade (sabse fast, data jaisa hai waisa) ⭐

1. https://console.neon.tech → apna project → **Billing / Upgrade**
2. **Launch plan (~$19/mo)** chunein → confirm
3. 1–2 minute me site apne aap chalu (kuch update karne ki zaroorat nahi)
4. Mujhe batao — main verify kar dunga (`/api/health/deep` → `status: ok`)

## Option B — Naya free database + data migrate (kharcha zero)

1. **Supabase** (free forever, 500 MB DB): https://supabase.com → GitHub se sign in →
   New project → **Connection string (Session/URI)** copy
   *(ya Neon me naya project — naya quota milta hai)*
2. Mujhe wo string bhejo. Main:
   - Render → Environment → `DATABASE_URL` = naya string (ya aap khud paste kar dein)
   - `python scripts/db_copy.py --from "<purana Neon URL>" --to "<naya URL>"`
     (purana Neon quota khulte hi — mahine ke reset par — chalta hai)
   - verify: books, orders, users ki ginti match
3. Beech ke dinon me site chalti rahegi (catalogue khali), phir data aa jayega.

## Option C — Sabse sasta paid (Render Postgres)

Render dashboard → **New → Postgres** (free 30 din, phir $6/mo) → Internal/External
connection string copy → mujhe bhejo. Baaki same as Option B.

## Uske baad main kya karunga (quota 90% kam)

PDF / cover photos / page-images abhi **database ke andar blob** hain — isi se quota
udta hai. Inhe Render disk par shift karunga (DB me sirf path), aur `db_report.py`
se pehle-baad ka MB dikhaunga. Iske baad Neon/Supabase free plan mahino chalega.
