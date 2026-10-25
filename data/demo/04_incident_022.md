# INCIDENT-022 — Reconciliation mismatch in test environment

Incident date: 2026-07-08
Status: Resolved in test; production impact: none

The test reconciliation job initially omitted two reversed transactions. The
Platform Engineer corrected the reversal filter and reran the test batch on
2026-07-09; the ledger and report then agreed. This was a test-environment
incident, not a production outage.

Outstanding risk: the team still needs to agree and document the retention
period before production use. The Security Reviewer owns that follow-up. See
ADR-014 and HANDOVER-009.
