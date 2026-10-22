# Daybook: invite-only App Store release

Release audit: 21 October 2026. **Not yet cleared for submission**: local checks do not prove paid
signing, production configuration, App Store Connect metadata or real-device acceptance. See
`.context/app-store-handoff.md` for this workspace's evidence and outstanding checks.

**Production update, 23 October 2026:** PR #58 is merged and deployed successfully. Production
health is OK and its entry bundle now includes `/privacy` and `/support`; the earlier missing-route
blocker is resolved. A public contact email and rendered-page verification are still pending.
`ALLOW_SIGNUP=false` is explicitly configured. Draft release PR #59 contains this workspace's
access-request UI, release guide and test corrections.

## Distribution choice

**Confirmed plan: a normal public App Store release, with account access granted by the developer.**
Anyone may find/download the app; using it requires an account. There is no public self-service
signup. Prospective users contact the developer using the Support link to request access; an admin
provisions their account. The developer supplies a dedicated account for App Review.

Use **Public** App Store distribution. Do not request unlisted distribution or choose Custom/Private
organization distribution for this release. TestFlight is an optional pre-release validation step,
not the final distribution method. Keep manual release selected until all launch checks pass.

Apple sources (checked 21 October 2026):
- [Distribution methods](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/set-distribution-methods/)
- [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [App Review guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Screenshot requirements](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
- [Privacy disclosures](https://developer.apple.com/app-store/app-privacy-details/)

## Step 1 — Developer account and app identity

1. Enroll in the paid Apple Developer Program and complete agreements in App Store Connect. A free
   Personal Team cannot upload an App Store release. Confirm the seller name you want shown.
2. In Certificates, Identifiers & Profiles, register an explicit App ID: `ca.atlys.daybook`.
   Check it belongs to the paid team before proceeding; confirm the identifier before first upload.
3. Xcode → Settings → Accounts: add the enrolled Apple account.
4. `ios/project.yml` now uses the paid Atlys Networks Inc. team `9ABFFFH4DJ`, version `1.0.0`,
   build `1`, with automatic signing. Increment the build number for every subsequent upload.
5. Run `cd ios && xcodegen generate`; open `Daybook.xcodeproj`. Verify Signing & Capabilities for the
   Daybook target uses the paid team and correct bundle ID.
6. App Store Connect → My Apps → + → New App: iOS, name Daybook (subject to availability), English,
   matching bundle ID, a private SKU such as `daybook-ios`. Set access for your team as appropriate.

## Step 2 — Lock the production service to invitations

1. Railway production: explicitly set `ALLOW_SIGNUP=false`. The code defaults to off in production,
   but an existing `true` overrides it. Do not enable it for App Review.
2. Set `NUXT_PUBLIC_CONTACT_EMAIL` to a real monitored support address. Deploy the intended current
   server code with per-user isolation and account deletion. Follow `DEPLOY.md`; do not point tests
   at Supabase or trigger unchecked branch migrations on production.
3. Signed out, verify `/privacy` and `/support` actually render and display that address; HTTP 200
   alone is insufficient for this SPA. Verify web signup cannot create an account. The production web/iOS UI hides Create Account; the server must also reject signup when disabled.
4. Admin → Settings → Users → Add user provisions invited accounts. Give ordinary invitees non-admin
   accounts; deliver their credentials privately. There is no invitation-code/email redemption flow.
5. Provision a dedicated **non-admin** reviewer account with a strong password and fictional content.
   Do this manually on production; automated tests must never run there. Never use `master_tester`
   or an existing person's account. Keep reviewer access working throughout review and future reviews;
   replace credentials in App Store Connect if rotated. Reviewers may exercise account deletion, so
   be prepared to provision a replacement.
6. Confirm backup retention really meets the policy's 30-day promise, including manual `backup.*`
   snapshots and provider backups. There is no verified automatic expiry in this audit. Any deletion
   of existing snapshots requires a separate scoped approval under AGENTS.md.

URLs:
- Privacy: `https://rc-notes-production-a50f.up.railway.app/privacy`
- Support: `https://rc-notes-production-a50f.up.railway.app/support`

## Step 3 — Validate the exact release candidate

1. Run `ios/scripts/test.sh` (isolated PGlite only). Run `npm test` in `app/` and the API/sync smoke
   suites against a separate throwaway test server; never production. Save results.
2. Build Release for a generic iOS device. Confirm the resulting Info.plist has no Debug ATS/local
   network exception and includes the correct version, ID and encryption declaration. Confirm the
   built app contains `PrivacyInfo.xcprivacy` and AppIcon. An unsigned build verifies compilation,
   not distribution signing.
3. Install the candidate on a real iPhone through TestFlight. Test sign-in, relaunch, creating tasks
   and subtasks, notes, journal day/workspace switches, offline edits, reconnection, conflict recovery,
   sync with the browser, logout and account deletion on a disposable invited account.
4. The app currently targets **iPhone and iPad** (iOS 18+). Test iPad portrait and landscape and collect
   its screenshots too. Do not silently remove iPad support to bypass validation.
5. Check VoiceOver, large text, touch targets, color-independent states, keyboard and small displays.
   Only claim accessibility support in App Store Connect that you have actually validated.
6. Check there is no promise of push reminders/notifications in metadata: these are not implemented.
   Check sign-in never offers public account creation in Release. Last-admin deletion is deliberately
   blocked; ordinary invited users must be able to delete their own account in Settings.

## Step 4 — Archive and upload

1. Xcode: choose Daybook scheme and **Any iOS Device (arm64)** / generic device destination.
2. Product → Scheme → Edit Scheme → Archive: confirm **Release**.
3. Product → Archive. In Organizer select the archive → Validate App; resolve every error.
4. Organizer → Distribute App → App Store Connect → Upload. Use automatic signing with the paid
   team. Review version/build and upload. Wait for processing and resolve any email warnings.
5. In Organizer generate/review the privacy report, including dependencies and required-reason APIs.
   UserDefaults is declared as CA92.1 for the app's own preferences. No third-party analytics/ads SDK
   is present in the Swift package. Recheck if dependencies change.
6. App Store Connect → TestFlight: add the build to a group. Invite external testers by email for a
   private beta (first external build may need Beta App Review). Provide reviewer credentials there
   too. Do not use a public TestFlight link if invitations should stay restricted.

## Step 5 — Complete the store listing

1. Category: Productivity. Price: Free, assuming the current no-payment product. Select intended
   countries/regions and complete any applicable trader/business declarations truthfully.
2. Suggested subtitle: `Tasks, notes & daily journal`.
3. Suggested description:

   > Daybook is a place for tasks, notes and a daily journal. Organize tasks with
   > subtasks and workspaces, link notes to your work, and plan your day. Your iPhone keeps a local
   > copy so you can keep writing offline and sync when you reconnect. An account provided by a
   > Daybook administrator is required. Public registration is not available.

4. Suggested keywords: `tasks,notes,journal,planner,checklist,offline`.
5. Set copyright to the actual rights holder; enter the public support/privacy URLs above.
6. Complete the current age-rating questionnaire honestly; let Apple calculate the rating instead
   of assuming the old checklist's “4+”. There is no public user-content feed/chat in this app.
7. Upload current screenshots with fictional data only: Today, Tasks/subtasks, Notes, Calendar.
   Supply the required iPhone size(s) shown in Connect and **13-inch iPad** screenshots because iPad
   is supported. Consult Apple's live specifications for accepted dimensions; simulator test
   screenshots are evidence, not automatically submission-ready assets.
8. Complete App Privacy and export compliance below. Select the processed build.
9. Select **manual release** so you control the launch after approval.

## Privacy answers — verify against production before publishing

Do you collect data? **Yes**. All categories below: linked to user, no tracking, App Functionality.
Keep this table, `app/pages/privacy.vue` and `ios/Daybook/Resources/PrivacyInfo.xcprivacy` aligned.

| Apple category | Actual data |
|---|---|
| User Content → Other User Content | tasks, notes, journal, goals, workspaces, tags, templates; content may also appear in recovery/audit logs |
| Identifiers → User ID | account ID and username |
| Identifiers → Device ID | `identifierForVendor` sent as `X-Daybook-Device` (vendor scoped, not an advertising ID) |
| Usage Data → Product Interaction | request activity, route and timing for functionality/security/recovery |

IP addresses and app/device versions are also stored in request logs. Apple's IP categorization
is based on actual use; confirm whether Diagnostics/Other Data must additionally be declared for
production logging. Do not claim location collection unless IPs are used to derive location. Generic
free-form journal content maps to Other User Content; do not claim that users cannot put sensitive
information into it. No ad tracking, ATT prompt, purchases or third-party login currently exist.
Username/password login alone does not require Sign in with Apple.

In-app deletion: Settings → Delete account → password and confirmation. Server deletes owned
content, sync records and linked event logs transactionally; iOS removes the account's local files
and draft/cache data. Other devices may retain offline copies until connected; verify the real-device
behavior and ensure the policy accurately describes backup/device retention.

`ITSAppUsesNonExemptEncryption=false` matches the present system HTTPS/TLS use. Reassess export
compliance if custom cryptography or product behavior changes; answer Connect's questions accurately.

## Step 6 — Submit for review and release

1. Pricing and Availability → App Distribution Methods: select **Public**; keep manual release selected.
2. App Review Information: real contact person, email/phone, Sign-in required, dedicated reviewer
   username/password generated by the developer. Paste the notes below. Keep the server reachable
   and reviewer account usable throughout review.
3. Add the version for review and submit it. No unlisted request is needed.
4. Respond to reviewer questions in App Store Connect. Do not switch public signup on as a workaround;
   the supplied working demo account gives reviewers access to the app.
5. After App Review approval, complete the final production and device checks and manually release.
6. Share the App Store link. Prospective users can request accounts through the developer's support
   address. Test a fresh install and one upgrade without losing offline data.

Suggested review notes (fill credentials in the dedicated secure fields, not in this repository):

> Daybook is a fully released tasks, notes and journal app. Account access is granted by the
> developer on request through the Support link. Accounts are provisioned by an administrator;
> public registration is intentionally disabled. Use the supplied non-admin demo
> account; no invitation code or special hardware is needed. Data is private per account.
> Account deletion is available at Settings → Delete account (enter the demo account password).
> Tasks, notes and journal work offline after initial sign-in; sync resumes on reconnection.
> There are no payments, advertising, third-party social login or push notifications.

## Local audit evidence (21 October 2026)

Swift core 78/78; backend 57/57; isolated API and sync smoke suites passed. Web production build
and unsigned iPhoneOS Release build passed. Built Release includes privacy manifest, UserDefaults
reason CA92.1 and a 1024px RGB icon; Debug network exceptions are absent.

Initial UI run passed 17/19. Two failures came from off-screen elements in lazy lists; the task test
and workspace-selection helper were corrected. A targeted rerun of the task lifecycle plus all four
journal safety flows passed 5/5, including both original failures. A full rerun on 23 October with main/PR #58 integrated passed **78/78 Swift tests and 19/19 UI
tests** (`ios/scripts/test.sh`, isolated PGlite). Real-device, iPad and signed archive acceptance
remain outstanding.

## Signed package (23 October 2026)

Bundle ID `ca.atlys.daybook` replaces the unavailable `com.arsalann.daybook`. App Store export
succeeded for 1.0.0 (1), signed by Apple Distribution: Atlys Networks Inc. (9ABFFFH4DJ); codesign
verification passed. Workspace artifact: `.context/Daybook-AppStore-1.0.0/daybook.ipa`.
This is a separate install from the old developer app: retain that app until its pending edits sync.
No upload or review submission has occurred. A new App Store Connect record is still needed.

## Final go/no-go

- [ ] Paid membership, team, signing, unique bundle ID and version/build confirmed
- [ ] Current backend deployed; signup explicitly disabled; reviewer login works
- [ ] Public legal pages render signed out with a monitored support address
- [ ] 30-day backup expiry and privacy disclosures verified against production
- [ ] Full isolated suites pass; signed archive validates; TestFlight real-device/iPad checks complete
- [ ] Accurate screenshots, listing, privacy, age rating and export compliance complete
- [ ] Reviewer details entered; Public distribution and manual release selected
