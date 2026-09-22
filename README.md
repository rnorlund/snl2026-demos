# SNL 2026 interactive demos

Four browser demos accompanying our posters at the Society for the Neurobiology
of Language 2026 meeting. Live at <https://rnorlund.github.io/snl2026-demos/>.

| | demo | poster |
|---|---|---|
| 1 | [`slm/`](slm/) | Predicting lesion from behavior |
| 2 | [`granularity/`](granularity/) | How much behavioral detail buys spatial detail |
| 3 | [`virtuouscycle/`](virtuouscycle/) | One model, read both ways |
| 4 | [`soop/`](soop/) | Reading aphasia severity out of a stroke note |

## What is published here

Fitted model parameters only. Specifically: regression coefficients per region
or per term, per-feature cohort summary statistics used to set slider ranges,
and headline performance numbers. There are no patient records, no per-patient
rows, no identifiers and no clinical notes in this repository, and nothing is
transmitted anywhere — each demo computes in your browser from the JSON beside it.

The text demo (`soop/`) publishes a screened list of clinical phrases: terms
containing digits, non-alphabetic characters, dates, or institution- and
person-shaped words are excluded, as are phrases appearing in fewer than 15
notes. Cohort summary statistics are rounded so that no value carries more
precision than the cohort-level claim it supports.

## Brain visualization

The three lesion demos embed [brainWhiz](https://rnorlund.github.io/brainWhiz/)
and drive it through `bw.js`. That file also documents why the slice planes need
to be switched to region cross-sections by clicking `#slKindMesh`, which is only
possible because these pages and brainWhiz share an origin.
