# Adobe Analytics — organization-specific context

This describes conventions specific to this Adobe Analytics implementation that
aren't discoverable from listReportSuites/listMetrics/listDimensions alone —
use it to resolve ambiguous user questions before calling those tools.

## Report suites and sites

We use a single report suite covering data from all our websites, rather than
one report suite per site. Main report suite ID: `example-rsid`.

To scope a question to a specific website, filter/break down by the dimension
`variables/server`. Its values are the
website domains themselves, e.g. `example-a.com`, `example-b.com`.

## Forms and leads/sales tracking

Form submissions are tracked via the event/metric `formular_submit`. <!-- TODO:
confirm exact spelling/ID via listMetrics — written here as told, but verify;
"fomular_submit" vs "formular_submit" matters since these are exact-match IDs. -->

Different form types are distinguished by the dimension `Form: Type` (exact ID:
TBD — resolve via listDimensions). Known values include:
- `sale`
- `b2c_produktlead`
<!-- TODO: add other known Form: Type values here as you encounter them -->

To count how often a specific form type was submitted (e.g. "how many sales
leads did we get"), combine the `formular_submit` metric with a `Form: Type`
dimension breakdown (or a segment filtering to a specific value), rather than
treating "sales" as a distinct metric on its own — it isn't one.
