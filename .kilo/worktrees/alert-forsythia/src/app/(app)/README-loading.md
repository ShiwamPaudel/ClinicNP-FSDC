# Why there is no `loading.tsx` in this route group

A `loading.tsx` here wraps every back-office route in a Suspense boundary. Next
then streams the fallback immediately, which commits the HTTP status as **200**
before any page has run — so `notFound()` from `requireModulePage()` produced a
404 *page body* with a **200 status**.

Rules.md §1.11 is absolute: a disabled module's URL returns 404, not something
that merely looks like one. Measured both ways:

| | `/stock` with the pharmacy module off |
|---|---|
| with `(app)/loading.tsx` | 200 |
| without it | 404 |

`NavProgress` (mounted globally in `components/providers.tsx`) still gives
navigation feedback, and without a fallback Next keeps the previous page on
screen while the next one renders — which reads better than a skeleton flash.

If a specific slow page ever needs a skeleton, add `loading.tsx` to that leaf
segment and put its module guard in a `layout.tsx` **above** the boundary.
