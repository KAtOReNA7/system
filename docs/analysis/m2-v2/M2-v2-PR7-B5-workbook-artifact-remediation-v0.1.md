# PR #7 B5 workbook and artifact-policy remediation v0.1

Status: `COMPLETE_PENDING_B8`; public sanitized; `not_for_formal_decision`.

B5 keeps `verify_m2_v2_workbook.py` as the single canonical executable and adds the frozen v0.2 package-complete implementation behind the explicit `m2-v2-pr7-s1-b5-strict-v0.2` profile. The verifier independently enumerates ZIP members, content types, relationship edges, graph closure, registered XML channels, bounded resources, safe external-hyperlink metadata, part decisions and derived facts. It emits no cell text, URL, host, private path or private identifier.

The 12 frozen workbook cases and 10 frozen required-artifact/zero-skip cases pass locally; the canonical command passes 27/27 tests and the full default suite passes 1176/1176 with zero skips. The default profile still requires all tracked artifacts and JSON pointers. Synthetic fixtures are generated deterministically with the standard library, contain no governed data, perform no external access and are not committed as generated binaries.

The B5 exact HEAD is `8804cd508f8e30d90dfc6f429e0b49ab6cae647c`. GitHub Actions run `30025925006` passed on Linux job `89270240561` and Windows job `89270240691`.

The exact bound historical workbook was reverified read-only. It fails the frozen v0.2 policy with two safe reason classes: `ooxml_zip_member_invalid` and `ooxml_xml_policy_violation`. The historical workbook and receipt remain immutable. B6 must rebuild a vNext workbook only from the existing immutable/append-only private evidence and source records into the authorized ignored S1 output root, then strictly reverify it before atomic supersession.

All 10 findings remain `OPEN`. B5 can reach only `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW` after exact-head CI and the required B6/B7 evidence. B8 is authorized only as an independent review; the implementing agent cannot self-review or declare findings closed. Provider, database, Canary/full160, training, holdout, mark-ready, merge and release remain unauthorized.
