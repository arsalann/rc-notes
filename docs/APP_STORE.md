# App Store launch preparation

**Status: preparing for a future launch.** App Store submission is deferred. The checklist below
is reference for when the user chooses to proceed; reviewer account creation, App Store Connect
setup and a submission archive are not required for the current production isolation rollout.

What App Store Connect asks for, with the answers that match what the app actually does. Keep this,
`app/pages/privacy.vue` and `ios/Daybook/Resources/PrivacyInfo.xcprivacy` in step: if the app starts
collecting something new, update all three.

## URLs (App Information)

| Field | Value |
|---|---|
| Privacy Policy URL | `https://rc-notes-production-a50f.up.railway.app/privacy` |
| Support URL | `https://rc-notes-production-a50f.up.railway.app/support` |

Both pages are public (no sign-in). Set `NUXT_PUBLIC_CONTACT_EMAIL` on Railway first, so they show
a contact address. A custom domain can replace the Railway URL later; update it here and in App
Store Connect.

## App Privacy questionnaire

**Do you or your third-party partners collect data from this app?** Yes.

| Data type (Apple's category) | What it is in Daybook | Linked to user | Tracking | Purpose |
|---|---|---|---|---|
| User Content → Other User Content | tasks, notes, journal pages, goals, workspaces, tags, templates | Yes | No | App Functionality |
| Identifiers → User ID | account id and username | Yes | No | App Functionality |
| Identifiers → Device ID | the random per-install id (`identifierForVendor`) sent as `X-Daybook-Device` for sync | Yes | No | App Functionality |
| Usage Data → Product Interaction | the request log (`event_log`: route, time, app version, IP) used for sync repair, security and recovery | Yes | No | App Functionality |

Not collected: contact info (no name, email or phone), health, financial, location, sensitive info,
contacts, browsing/search history, purchases, diagnostics/crash data (no SDKs), advertising data.

**Tracking:** No. No third-party SDKs, no ads, no data brokers.

## Account deletion (guideline 5.1.1(v))

In the app: Settings → Delete account (password + confirmation). Deletes the account and all its
data on the server (`DELETE /api/auth/account`) and the local copy on the device. Also on the web
in Settings. Mention this in the review notes.

## Sign-in

Username + password only, no third-party sign-in, so Sign in with Apple is not required.
`ALLOW_SIGNUP=true` must be set on Railway before review (reviewers create accounts).

## Review notes / demo account

Create a dedicated reviewer account on production from Settings → Users (admin), e.g. `appreview`,
with a strong password; put it in App Review Information. Never give out `master_tester` (test-server
only) or a real account. Delete the reviewer account after approval.

Suggested note:

> Daybook is a personal tasks, notes and journal app. Sign in with the demo account above, or create
> an account on the sign-in screen. Data is private to each account. Account deletion: Settings →
> Delete account.

## Export compliance

`ITSAppUsesNonExemptEncryption` is `false` in `Info.plist` (HTTPS only), so no export documentation.

## Future submission checklist (deferred)

- [ ] Production deployed with per-user isolation; `v16_assign_owner` applied (DEPLOY.md "Launch")
- [ ] `ALLOW_SIGNUP=true`, `NUXT_PUBLIC_CONTACT_EMAIL` set; `/privacy` and `/support` load signed out
- [ ] Reviewer account created
- [ ] `ios/scripts/test.sh` green; Release build archived from Xcode with a paid developer team
      (free-team builds cannot be submitted)
- [ ] Screenshots (6.9" and 6.5" iPhone), app description, keywords, age rating (4+), category (Productivity)
- [ ] Old snapshots in `backup.*` older than 30 days dropped (privacy policy promise)
