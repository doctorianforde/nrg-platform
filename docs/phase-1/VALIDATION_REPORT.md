# T32–T34 — Validation Report (production)

Run date: · Migration run_id: · Source file(s):

## T32 Counts
```sql
select count(*) from public.questions;
select d.code, count(q.id) from public.domains d left join public.questions q on q.domain_id=d.id and q.is_active group by d.code, d.display_order order by d.display_order;
select question_type, count(*) from public.questions group by 1;
select count(*) from public.question_options;
select count(*) from public.questions where body is null or body='';
select status, count(*) from public.migration_log where run_id='<run_id>' group by 1;
```
| Check | Expected | Actual | OK |
|---|---|---|---|
| Total questions | source total ± exclusions | | |
| Domain distribution | matches audit | | |
| Options per MCQ | 4 | | |
| Null bodies | 0 | | |
| migration_log errors | 0 | | |

## T33 Sample QA (20 random)
```sql
select id, source_id, body from public.questions where is_active order by random() limit 20;
```
| source_id | body ok | correct option ok | options complete | explanation ok | domain ok | Result |
|---|---|---|---|---|---|---|

Passed: /20 · Failed: (list)

## T34 RLS end-to-end
DB-level policy suite (21 checks) passed on staging 2026-09-16 — see `supabase/migrations/20260916040000_add_rls_policies.sql`.
Live-site checks passed 2026-09-16: student blocked from /admin, signed-in redirect from /login, teacher routing.
| Session | Check | Result |
|---|---|---|
| student | SELECT questions → rows | |
| student | INSERT question → blocked | |
| student | other profiles → 0 rows | |
| teacher | INSERT question → ok | |
| admin | UPDATE any question / read all profiles → ok | |
| anon | SELECT questions → 0 rows | |
