# Adobe Analytics — organization-specific context

This is the central source of truth for how this Adobe Analytics setup is
structured — conventions that aren't discoverable from
listReportSuites/listMetrics/listDimensions alone. Use it to resolve
ambiguous user questions before calling those tools.

## 1. Overall structure

<!-- TODO: describe how report suites map to sites/properties — one report
suite per site, or one shared report suite scoped by a dimension? If shared,
name the report suite ID and the scoping dimension. -->

Example: We use a single report suite covering all websites, rather than one
per site. Main report suite ID: `example-rsid`. To scope a question to a
specific website, filter/break down by the dimension `variables/server` —
its values are the website domains themselves, e.g. `example-a.com`.

## 2. Default metrics

<!-- TODO: list the metrics that should be used by default for common
questions, so the LLM doesn't have to guess between similarly-named options
returned by listMetrics. -->

Example: "traffic" -> `metrics/visits`; "revenue" -> `metrics/revenue`.

## 3. Default dimensions

<!-- TODO: list dimensions commonly used for breakdowns, with their exact
IDs, since these aren't always obvious from listDimensions' output. -->

Example: "page" -> `variables/evar5` (Page Name); "campaign" -> `variables/evar10`.

## 4. Default segments

<!-- TODO: list any saved segments that should be used by default or offered
for common questions, with their segment IDs. -->

Example: "excluding internal traffic" -> segment ID `s123456_abcdef`.

## 5. Conversion measurement

<!-- TODO: describe how conversions/leads/sales are tracked — usually a
shared event/metric plus a dimension breakdown for the type, rather than a
distinct metric per conversion type. Name the exact metric and dimension
IDs, and list known dimension values. -->

Example: Form submissions are tracked via the event/metric
`formular_submit`, broken down by the dimension `Form: Type` (values include
`sale`, `b2c_produktlead`). To count a specific form type (e.g. "how many
sales leads"), combine the `formular_submit` metric with a `Form: Type`
breakdown or segment — "sales" is not a distinct metric on its own.

## 6. Other specifics

<!-- TODO: anything else org-specific that doesn't fit above — e.g. known
data quality quirks, excluded traffic, naming conventions for evars/events. -->

Example: Bot traffic is already excluded at the report-suite level; no
additional filtering needed.
