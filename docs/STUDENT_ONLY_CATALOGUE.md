# Student-only catalogue: staging review and installed-client impact

Decision (owner, 24 Nov 2026): Stuora is student-only. Student-posted listings, listing photos and group names require an eligible, signed-in GISMA student. Sign-in, recovery, privacy, safety and support stay public.

Stacked on PR #39 (`5882eed`) and kept separate, so that PR's CI result remains traceable. **Drafts, not applied anywhere.**

## Changes

| Layer | Change |
|---|---|
| `20261124120000_student_only_catalogue.sql` | Listings: only GISMA students read others' published posts, and authors read their own. Housing/marketplace/trip/job/event details and listing-photo metadata are removed from the `anon` role and follow the listing. Group names: GISMA students plus each group's owner. **Table grants are not revoked**, so disallowed reads return empty results, not errors. |
| `20261124121000_private_listing_media_bucket.sql` (apply later) | `listing-media` becomes **private**. A photo file can be read only when its metadata row is visible to the caller, which requires GISMA and a visible listing. Owners keep their own uploads. |
| App (web, Android and iOS share `src/`) | Signed-out visitors and non-GISMA accounts see a student-only gate in place of Home previews, Explore categories, People and Groups, and **send no catalogue requests**. Photos load through 1-hour signed URLs (`createSignedUrls`, batched and cached), falling back to the public URL while the bucket is still public. Stuora Bot explains that student content needs a GISMA sign-in instead of reporting "no results". |
| Unchanged | Sign-in, signup, recovery, the legal/privacy/safety/support pages, Stuora-verified `student_benefits` (curated offers, not student posts), and Ticketmaster browsing (already sign-in only). |

## Impact on installed 0.1.6 clients

Installed builds:
- **Android** Play Internal 0.1.6 (7), source `5f4f38f`.
- **iOS** TestFlight from `e78acfa`, EAS build `da66712c-1841-41fe-9a87-12044163bad1`.

Both allow signed-out browsing and build photo URLs with `getPublicUrl`.

| Who | After `120000` (RLS) | After `121000` (private bucket) |
|---|---|---|
| Signed-out visitor | Home, Housing, Marketplace, Trips, Jobs, Events and Groups show their **empty states** ("No … listings found"). There is no error and no student data. The copy implies there are no listings, which is misleading but not a leak. | Same. |
| Signed-in GISMA student | Unchanged: listings and photos load. | **Photos stop loading** (public URLs are refused). Listings, details and messaging still work. |
| Legacy non-GISMA account | Empty catalogue, as for signed-out. | Same. |

**Required order:**
1. Apply `120000` together with PR #39's migrations. It is safe for 0.1.6: empty, not broken.
2. Ship the build containing this client change to Play Internal and TestFlight. It works against either bucket state.
3. Confirm internal testers are on it.
4. Then apply `121000`.

Until step 4, anyone who already has a photo's public URL can still download it.

## Existing public photo URLs

- **Live staging (read-only check, 24 Nov):** 0 objects in `listing-media`, 0 `listing_media` rows, 0 listings, 0 groups. No existing photo URL is exposed or would break on staging.
- **Production** is out of scope and was not inspected.
- **Caching:** photos are uploaded with `cacheControl: 3600`. After the bucket becomes private, a browser or CDN that already fetched a public URL may keep serving it for up to an hour.
- **Signed URLs:** valid for one hour. A student who copies one can share it for at most that long. This is an accepted, bounded risk; lower `TTL_SECONDS` in `src/listings/listingPhotoUrls.ts` to tighten it.

## Acceptance (from the owner's decision)

| Requirement | Evidence |
|---|---|
| A signed-out visitor cannot retrieve student content from the API | DB test `Student-only catalogue…`: anon reads 0 rows of listings, details, photo metadata and groups. `database.test.mjs` anon counts now 0. |
| A signed-out visitor cannot retrieve it from Storage | The bucket is private after `121000` (asserted). With no public bucket, Storage serves objects only through RLS, and no `anon` policy exists. |
| A legacy non-GISMA account cannot retrieve it | The same DB test: 0 rows for listings, details, metadata, groups and photo objects. Browser test: gate shown, zero catalogue requests. |
| An eligible GISMA student browses and loads photos | DB test: 1 row each, plus the photo object is readable. Browser test: the cover photo loads from `/object/sign/listing-media/…?token=…`, never `/object/public/`. |
| Archived listings stop exposing photos | DB test: after archiving, other students can no longer read the object; the owner still can. |

**Still to prove on live staging** (after review, with two consenting students on Android and iOS):
- Signed-out on the web preview: the gate shows, and `curl` of a former public photo URL is refused.
- A non-GISMA account sees the gate.
- A GISMA student browses and sees photos on Android, iOS and web.

## Rollback

**`121000`:**
```
update storage.buckets set public = true where id = 'listing-media';
drop policy listing_media_student_select on storage.objects;
```

**`120000`:**
1. Recreate `listings_read_published_or_owned` for `anon, authenticated`.
2. Run `alter policy … to anon, authenticated` on the five detail tables and `listing_media_read_visible`.
3. Recreate `student_groups_browse_public` (`using (true)`, `anon, authenticated`).

The client change is compatible with both states, so no app rollback is needed.
