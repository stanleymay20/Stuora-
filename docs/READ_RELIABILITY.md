# Profile and listing read reliability

Continues merged main 66fd304d6220a48e15dcc1265d3df19ec8cd68b6.

Profile loading and Housing/Marketplace discovery previously waited indefinitely
when a network request stalled. Each read now has a 15-second deadline, an
explicit connection error and the existing retry action. Retry starts a fresh
request. A timed-out response cannot be treated as an empty profile or list.

Reads use the Supabase query AbortSignal. Cleanup clears the deadline and aborts
the old request on logout, account change, search/category change or unmount.
Completion handlers reject aborted results. Existing ownership, privacy, search,
pagination and write behavior remain unchanged. No schema, grants or CI changes.

Browser regression tests hold HTTP responses and advance the browser clock.
They check timeout/retry recovery, late response rejection, logout cleanup and
search replacement on desktop and mobile layouts. Test users and records exist
only in HTTP fixtures; these tests do not qualify real email delivery or native
device behavior.

## Remaining Auth acceptance dependency

The live public Auth settings confirm email signup is enabled and email
confirmation is required. SMTP and redirect settings are not exposed by the
current connector, so their configuration has not been verified. Do not disable
confirmation to bypass delivery failures.

Before a real two-account acceptance test, inspect the dedicated project's Auth
email delivery and URL configuration, confirm delivery to the test accounts,
then create/discover/edit/archive records across independently signed-in clients.
Supabase's default email service restricts recipients and is best effort; if this
project uses it, configure a verified custom SMTP sender for general signup.

Official references:
- https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/redirect-urls

Session restoration, Auth submissions and writes are outside this read-only
deadline change. In particular, an ambiguous listing write must not be retried
automatically: a lost response could otherwise create duplicate listings.
