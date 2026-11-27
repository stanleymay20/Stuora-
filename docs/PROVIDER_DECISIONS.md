# External job providers: decisions (27 Nov 2026)

Summary of the providers' replies, recorded by the operator. No correspondence,
mailbox links or credentials are stored in this repository.

| Provider | Decision | Date | Effect in Gismate | What would change it |
| --- | --- | --- | --- | --- |
| Adzuna | The trial key allows 25 free API calls. The Standard plan covers publicly accessible listings only. Gismate shows jobs to signed-in students, so displaying Adzuna jobs needs a **separate commercial licence**. | 26 Nov 2026 | Feed stays **disabled**: `ADZUNA_COMMERCIAL_LICENSE` is not set, so `external-data` does not construct the provider and jobs return `503 FEATURE_DISABLED`. No plan purchased. No credentials check was run (it would not change the decision and would spend trial calls). | A signed commercial licence covering sign-in-only display. Then set the flag on staging, run one signed-in search, and check the per-advert "Adzuna" label (already built). |
| Bundesagentur für Arbeit | **Declined for current use**: the data partnership was declined for Gismate's described use. | 26 Nov 2026 | Provider stays **disabled**: `BA_JOBSUCHE_ENABLED` is not set. | A new request with a different use, and written approval. |

Student-posted jobs (Explore → Jobs, moderated, from employer and partner accounts)
are a separate feature and are not affected by either decision.

Other integrations: see [RELEASE_CANDIDATE_0.1.7.md](RELEASE_CANDIDATE_0.1.7.md#provider-dependencies).
