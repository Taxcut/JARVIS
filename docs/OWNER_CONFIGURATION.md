# Owner configuration record

Incorporated on 2026-09-20 from the owner-provided `jarvis setup info.txt`. This is a sanitized requirements record, not a copy of the source. Later explicit owner/repository decisions supersede earlier preferences; blank fields do not erase recorded decisions. No source attachment or secret value belongs in Git.

## Preferences for future phases

| Setting                     | Owner choice       | Interpretation / remaining work                                                                                           |
| --------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Timezone                    | America/New_York   | Future scheduling uses this IANA zone and handles daylight-saving changes. Database timestamps remain UTC.                |
| Spoken voice                | `bm_george`        | Future voice output preference; see VOICE for the synthesis boundary. No model or runtime installed.                      |
| Weekday wake-up             | 12:00 noon         | Planned local-time default only; no schedule created.                                                                     |
| Saturday wake-up            | 07:00              | Specific exception: class at 09:00, wake two hours before.                                                                |
| Other weekend wake-up       | 13:00–14:00        | Sunday remains a window; choose an exact time with the owner before enabling a scheduler.                                 |
| Maximum call retries        | 5                  | Confirm whether this means five retries after the initial call or five total attempts before implementation.              |
| Retry interval              | Not supplied       | Needs an explicit value before calls can be enabled.                                                                      |
| No-answer fallback          | Owner wrote “BOTH” | The two referenced options are undefined; clarify the channels/actions in the phone phase. Do not infer or send anything. |
| Additional wake-up behavior | Not supplied       | No additional behavior authorized by the blank field.                                                                     |

These are owner-specific planned defaults, not seeded operational data or global product defaults. No Phase 2 database migration, runtime scheduler, wake-up call, model download or provider integration is introduced.

## Provider and infrastructure readiness

| Area                       | Recorded state                                                                                                  | Next relevant phase                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| OpenAI                     | Account reported ready; API key supplied to private local configuration; not verified against the provider      | Conversation integration                                                                            |
| LiveKit                    | Project reported ready; URL, key and secret supplied privately; not provider-verified                           | Realtime audio/phone integration                                                                    |
| Twilio                     | Account reported ready; SID and auth token supplied privately; no Twilio number supplied; not provider-verified | Phone/SMS setup                                                                                     |
| Owner phone                | Supplied format did not pass strict E.164 validation; not imported                                              | Confirm country and normalized number privately before phone setup                                  |
| sherpa-onnx                | Not installed                                                                                                   | Later voice phase installs the runtime                                                              |
| Wake-word model / keywords | Model not downloaded; custom keywords not configured                                                            | Later voice phase downloads/configures and verifies real detection                                  |
| VPS                        | Not purchased; IP and SSH readiness not supplied                                                                | Preserve the recorded InterServer 1 Slice / New Jersey baseline in JARVISSETUP; no provisioning now |
| Domain / DNS               | No domain owned; name and DNS provider not supplied                                                             | Later deployment setup                                                                              |

Account readiness is owner-reported. Locally supplied credentials establish only configuration presence, not valid provider access, billing eligibility or working integrations. No paid service, phone number, VPS or domain was purchased or enabled.

## Private configuration handling

The supplied OpenAI, Twilio and LiveKit values were imported into the existing ignored local `.env`, with mode 0600, through the private setup path. Existing local database/bootstrap credentials were preserved. This environment file is not an alternative store for native device keys or refresh credentials: those remain exclusively in Keychain/Credential Manager. No real phone value was imported.

Tracked examples retain only blank names: `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and `JARVIS_OWNER_PHONE`. Phase 2 does not consume these future provider fields or mark setup complete because they are present. Do not use a `VITE_` prefix, place values in frontend code, log them, or include them in issue/CI output. Future production setup must use protected backend/provider configuration and review rotation/access requirements.

## Phase 2 validation boundary

The original document did not override the earlier Mac validation deferral. The owner's later explicit continuation resumed and completed Mac Keychain approval, restart/resume, additional passkey sign-in, recovery setup and authenticated GUI/reconnect checks. The owner intentionally deferred Windows Hello/Credential Manager physical validation to the Gaming PC later; it is not a Mac closure blocker. No secure-storage bypass is permitted. IMPLEMENTATION_STATUS distinguishes real physical evidence, automated recovery-consumption tests and the pending Windows checks.
