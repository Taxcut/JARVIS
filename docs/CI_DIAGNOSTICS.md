# Hosted CI startup blocker

## Verified on 2026-09-20

The repository remains private and the intended validation workflow is unchanged. No source changes were needed during this investigation.

| Check                        | Result                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub CLI authentication    | Valid Taxcut account; repository/workflow access works                                                                                            |
| Repository Actions settings  | Enabled; all actions allowed; SHA pinning not required                                                                                            |
| Workflow token permissions   | Read-only default, compatible with the workflows; PR approval disabled                                                                            |
| Workflow registration        | Validate and Unsigned package validation both active                                                                                              |
| Local workflow validation    | Both pass actionlint 1.7.12                                                                                                                       |
| Intended workflow dispatch   | [Run 35491618928](https://github.com/Taxcut/JARVIS/actions/runs/35491618928): `startup_failure`, zero jobs/check runs, no downloadable logs       |
| Minimal control dispatch     | [Run 35491676010](https://github.com/Taxcut/JARVIS/actions/runs/35491676010): same `startup_failure`, zero jobs/check runs                        |
| Public GitHub service status | Actions reported operational with no active incident when checked; [official status](https://www.githubstatus.com/)                               |
| Account billing API          | Unavailable with current OAuth scopes; API returned 404 and CLI identified missing `user` scope. Billing status is unknown, not assumed exhausted |

The earlier attempts reported the synthetic `BuildFailed` path. The new attempts identify their actual workflow names and `.github/workflows/validate.yml`, but still fail before scheduling. This distinction is recorded rather than assuming every failure has identical metadata.

## Minimal control

A temporary diagnostic branch at `eef595c55e5c413ddba98ef0a7202915e3e103d7` used only the following workflow. It had no checkout, third-party actions, dependencies, service containers, secrets, application code, matrix or macOS/Windows runner requirements:

```yaml
name: Actions startup diagnostic
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  probe:
    runs-on: ubuntu-latest
    timeout-minutes: 2
    steps:
      - name: Confirm hosted runner startup
        run: echo 'Hosted runner started successfully'
```

The temporary branch was removed after collecting evidence; its changes were not merged into main. The run record retains the diagnostic commit and result.

## Conclusion and boundary

The minimal control reproduces failure independently of JARVIS's build, tests, dependencies and platform matrix. No incompatible repository setting or workflow syntax error was found. The remaining blocker lies in GitHub/account-side workflow startup or eligibility; the exact internal cause is not exposed through available diagnostics. Operational public status does not rule out account-specific restrictions or a service defect. Zero scheduled jobs is not a passing CI result and is not a Windows/macOS compilation failure.

No credentials were refreshed, spending enabled, billing changed, visibility relaxed or self-hosted runner installed to bypass this blocker. Hosted Linux/macOS/Windows acceptance remains **BLOCKED**. All local gates are recorded separately in IMPLEMENTATION_STATUS.

## Owner-only resolution

Review GitHub account billing/Actions eligibility and any account restrictions in an authenticated account session, or authorize the required account-read OAuth scope if appropriate. If those settings are healthy, provide GitHub Support the repository, the two run URLs and minimal-control evidence above. The agent did not submit a support message. Once the service/account issue is resolved, rerun `Validate` and inspect all three jobs; investigate any actual test/build failures then. No rebuild of the JARVIS foundation is indicated by this startup failure.
