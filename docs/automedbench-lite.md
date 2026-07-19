# AutoMedBench-Lite Gate for Trial-Screener Updates

Use this gate before accepting AI-generated changes to eligibility logic, trial criteria, URL/prefill behavior, offline behavior, or public-demo copy.

This gate evaluates workflow discipline only. It does not make this repository an official recruitment workflow, trial source of truth, or bedside clinical tool.

## S1 Plan

- Identify the exact trial, criterion, input field, or output message being changed.
- State whether the change affects eligibility logic, UI copy, service worker behavior, or documentation only.
- List assumptions, source gaps, and stop conditions.

## S2 Setup

- Inspect `index.html`, `manifest.json`, `sw.js`, `COMPLIANCE.md`, and any source criteria.
- Confirm the input examples are synthetic or de-identified.
- Identify manual browser checks needed for mobile/PWA behavior.

## S3 Validate

- Check every criterion against study-owner-approved or public source material before changing logic.
- Run synthetic pass/fail cases for each affected criterion.
- Confirm URL-hash prefill remains disabled on the public deployment.
- Confirm no PHI, participant information, real encounter data, or confidential workflow details are introduced.

## S4 Execute

Make only the scoped change after S1-S3 are complete. Preserve public-demo and no-PHI language.

## S5 Submit

Report changed files, source trace, synthetic test cases, browser/manual checks, and residual review needed before any operational use.

## One-Shot Prompt

```text
Apply the stroke-trials-screener AutoMedBench-Lite gate. Write S1 Plan, S2 Setup, and S3 Validate before editing. Then execute the scoped change and submit changed files, source trace, synthetic pass/fail cases, manual browser checks, and residual trial-owner or IRB/HSD review need. Stop if eligibility-source validation cannot be completed.
```
