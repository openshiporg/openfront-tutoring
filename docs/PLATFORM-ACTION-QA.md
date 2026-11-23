# Staff workspace action verification

Local verification only. No live deployment or live booking/payment verification is claimed.

## Build and dependencies

- Shared UI/forms/request helpers are tracked in `faad210`; their APIs matched the temporary copies. No temporary helper files were committed by the storefront worker.
- Keystone schema build and Next production build passed at `475e54e`: `/tmp/b7ks-tracked.log`, `/tmp/b7next-tracked.log`.
- TypeScript check passed with tracked shared dependencies: `/tmp/b7tsc-final.log`.
- Seven platform navigation/query tests passed: `/tmp/b7platform-unit.log`.
- All eight assigned pages were reached by clicking real Sidebar links: `/tmp/b7scope-final.log`.

## Action matrix

| Result | Role | Page/action | Evidence |
| --- | --- | --- | --- |
| PASS | Owner | Families: list/detail, add child, log contact, goodwill credit | `/tmp/b7plat.log` |
| PASS | Owner | Record and publish review; edit notes; create family with child | `/tmp/b7plat2-recheck.log` |
| PASS | Owner | Student: propose learning plan with goal | `/tmp/b7plat2.log` |
| PASS | Owner | Tutor: add/remove availability; record/verify credential | `/tmp/b7plat2.log` |
| PASS | Owner | Application: create, screening, interview, checks, approve | `/tmp/b7approval.log` (production server) |
| PASS | Owner | Tutor: activation refused before verified background check, succeeds after verification | `/tmp/b7approval.log` (production server) |
| PASS | Tutor account | Approved applicant has a user; sign-in succeeds after owner sets a password through normal User mutation | GraphQL verification; account IDs below. Email delivery not verified. |
| PASS | Owner | Progress: draft, publish, withdraw | `/tmp/b7plat2.log` |
| PASS | Owner | Catalogue: create programme/plan/package, publish plan, archive programme, create/end promo | `/tmp/b7plat2-recheck.log` |
| PASS | Owner | Location: room capacity, opening hours, closure persist after reload | `/tmp/b7scope-final.log` |
| PASS | Owner | Location: staff assignment/removal persist, including restoring an inactive membership | `/tmp/b7scope-final.log` |
| PASS | Manager | Other centre's Room update denied and capacity unchanged | `/tmp/b7scope-final.log` |
| PASS | Owner, manager | Reports return aggregates | `/tmp/b7plat.log`, `/tmp/b7plat2.log` |
| PASS | Maple manager | Explicit Riverside reports request denied | `/tmp/b7scope-final.log` |
| PASS | Front desk | Reports denied; page displays permission message | `/tmp/b7scope-final.log` |
| PASS | Guardian | Registered through registerGuardian; reports request denied | `/tmp/b7scope-final.log` |

## Product defects fixed

- `6b37216` (backend): a new child with an unselected level previously became an invalid Prisma `disconnect` on create. Re-proved family-with-child creation in `/tmp/b7plat2-recheck.log`.
- `baee48c`: family creation no longer closes its drawer and hides an error when only the family was saved.
- `07baacd`: read permission refusals previously became masked “Unexpected error”; now return safe GraphQL access errors. Re-proved front-desk page message and scope denials.
- `b258b28`: adding an inactive centre staff member previously attempted a duplicate unique membership. Now restores the existing row using the same scoped list update. Re-proved after reload.
- `1b79e10` (backend): safe Tutor-role provisioning for older installations. Application approval re-proved after non-destructive role repair.

## QA/setup failures, not product defects

- Review test initially omitted all tutor/programme/location targets. The backend correctly refused it. The corrected test explicitly selects a programme; review validation retained.
- Package assertion matched both `$450` and `$45`; corrected to an exact match.
- Closure assertion expected a standalone text node; corrected to match its list item. Closure was already persisted.
- Initial guardian setup tried forbidden anonymous createUser; corrected to registerGuardian.
- Scratch database lacked the Tutor role. Backend repaired only roles; no catalogue/history reset or reseed occurred.

## Approval evidence

- Application: `cmwstyonj0000uzoljyvyvuc8` (`approved`).
- Tutor: `cmwstzpq4000auzol9lg6ektn` (`active`).
- User: `cmwstzoo80009uzol2mezguxh` (Tutor relationship verified by owner query).
- Authentication returned `UserAuthenticationWithPasswordSuccess` for this user after an owner-authorized password update. No credentials are stored here.

## Remaining limitations

- Live deployment and main customer booking/payment action remain unverified.
- SMTP/set-password email delivery is not verified in this harness. Successful account creation/authentication does not prove delivery.
- This matrix records exercised actions, not exhaustive coverage of every form, all role combinations or concurrency cases.
