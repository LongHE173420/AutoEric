# Planner Random

Tai lieu nay mo ta phan random moi cho `AutoEric`.

## Muc tieu

- Giu tinh ngau nhien cho `post` va `surf`.
- Giam viec nhieu account cung `post`/`surf` trong cung mot run.
- Khong de account vua `post` xong run truoc lai `post` tiep ngay run sau.
- `fail = mat luot`, nen quota duoc tinh theo attempt.

## Cach hoat dong

He thong khong de tung account tu `Math.random()` doc lap nua.
Thay vao do, moi job se co mot planner o cap toan job:

1. `service.ts` load toan bo account cua run hien tai.
2. `RunPlannerService` tinh danh sach account du dieu kien.
3. Planner tinh so slot `post` va `surf` cua run tu quota con lai.
4. Planner random co trong so de chon account thang.
5. `MasterWorker` truyen quyet dinh xuong `EricWorker`.
6. `EricWorker` chi thi hanh theo plan, khong tu random nua.

## Config moi

Them cac bien sau vao `.env`:

```env
ACCOUNT_ACTIVITY_PLANNER_ENABLED=true
POST_MIN_GAP_RUNS=4
SURF_MIN_GAP_RUNS=3
ALLOW_POST_AND_SURF_SAME_RUN=false
POST_START_JITTER_MS=15000
SURF_START_JITTER_MS=10000
REDIS_KEY_PREFIX=ae
```

## Y nghia config

- `ACCOUNT_ACTIVITY_PLANNER_ENABLED`
  - Bat/tat planner moi.
- `POST_MIN_GAP_RUNS`
  - So run toi thieu giua 2 lan post cua cung mot account.
- `SURF_MIN_GAP_RUNS`
  - So run toi thieu giua 2 lan surf cua cung mot account.
- `ALLOW_POST_AND_SURF_SAME_RUN`
  - Neu `false`, mot account da duoc chon post se khong duoc surf trong cung run.
- `POST_START_JITTER_MS`
  - Delay ngau nhien ngan truoc khi bat dau post.
- `SURF_START_JITTER_MS`
  - Delay ngau nhien ngan truoc khi bat dau surf.
- `REDIS_KEY_PREFIX`
  - Prefix key Redis dung cho planner state.

## Redis dung de luu gi

Planner su dung Redis de luu state tam:

- carry `post`/`surf` theo ngay
- run gan nhat da `post` cua tung account
- run gan nhat da `surf` cua tung account

Neu Redis chua duoc cau hinh, code se fallback sang bo nho trong process.

## Rule quota

- `post` va `surf` duoc tinh quota theo attempt.
- Neu action fail, luot do van bi tru.
- Dieu nay khop voi rule van hanh hien tai: `fail = mat luot`.

## File lien quan

- `src/service.ts`
- `src/com/nasa/policy/AccountActivityPolicy.ts`
- `src/com/nasa/policy/RunPlannerService.ts`
- `src/com/nasa/storage/plannerStateStore.ts`
- `src/com/nasa/worker/MasterWorker.ts`
- `src/com/nasa/worker/EricWorker.ts`
