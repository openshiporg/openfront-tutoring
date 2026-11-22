# Storefront routes (dissertation §6.1 and §6.2)

Every row is reachable by clicking from home or the account nav. Reads go through `features/keystone/queries/storefront.ts`; writes through the backend mutations named. "Working" was checked against the scratch database on 2026-11-22. Card steps need Stripe keys in Settings → Payments (or `STRIPE_SECRET_KEY` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`); without them the place or assessment is still written and the customer is told plainly that card payment is not set up yet.

| # | Route | Click path from home | Operations | State |
|---|---|---|---|---|
| P1 | `/` | entry | `storefrontBusiness` (featured programmes, locations, reviews, stats) | working |
| P2 | `/programs` | header → Programs | `storefrontPrograms(filter)` | working |
| P3 | `/programs/[slug]` | Programs → card | `storefrontProgram` | working |
| P5 | `/locations`, `/locations/[slug]` | header → Locations → card | `storefrontLocations`, `storefrontLocation` | working |
| P6, P7 | `/tutors`, `/tutors/[slug]` | header → Tutors → card | `storefrontTutors`, `storefrontTutor` | working |
| P8 | `/pricing` | header → Pricing | `storefrontPricing` | working |
| P9 | `/assessment` → `/assessment/confirmed/[id]` | header / hero "Book an assessment" | `assessmentSlots`, `bookAssessment`, `myAssessment`, `payInvoice`, `refreshPayment`, `cancelAssessment`, `rescheduleAssessment` | working (booking verified; fee card step needs Stripe keys) |
| P10, P11 | `/contact` | header / footer → Contact | `submitEnquiry` | working |
| P12 | `/schedule` | header → Schedule | `openSessions` | working |
| P13, P18 | `/enrol/[programSlug]` → `/enrol/checkout?enrolment=` → `/enrol/confirmed/[id]` | programme page / pricing / schedule → Enrol | `enrolmentOptions`, `startEnrolmentCheckout`, Stripe Elements, `completeEnrolmentCheckout`, `myEnrolment`, `payInvoice` | working up to card (enrolment + invoice written; card needs Stripe keys) |
| P15 | `/policies` | footer → Policies | `storefrontPolicies` | working |
| P17 | `/account/sign-in`, `/account/register`, `/account/reset` | header → Sign in | `authenticateUserWithPassword`, `registerGuardian`, `sendUserPasswordResetLink`, `redeemUserPasswordResetToken` | sign-in and reset working; register waiting on backend `registerGuardian` |
| A1 | `/account` | header → My account | `myFamily` (alerts, upcoming, students, memberships) | working |
| A2, A23 | `/account/profile` | account nav → Profile and card | `myFamily`, `createSetupIntent`, `setDefaultPaymentMethod` | view working; editing children/address waiting on a backend `updateMyFamily` mutation (page points to Contact meanwhile) |
| A3, A4, A10 | `/account/schedule` | account nav → Schedule | `myBookings`, join link from 10 minutes before | working |
| A5, A8, A9 | `/account/book` | account nav → Book | `openSessions`, `bookSession`, `joinWaitlist`, `leaveWaitlist` | working |
| A6, A7 | `/account/bookings/[id]` | Schedule → row "Details" | `myBooking`, `cancellationPreview`, `cancelBooking`, `rescheduleBooking` | working |
| A11–A14 | `/account/progress`, `/account/progress/plan/[id]` | account nav → Progress → plan | `myStudent`; accept leads to `/enrol/[slug]?learningPlan=` | working |
| A15 | on `/account/schedule` | — | `confirmTutor`, `requestRematch` | waiting on backend mutations |
| A16, A17 | `/account/credits` | account nav → Hours / alert | `myCredits`, `purchasePackage` | working (card needs Stripe keys) |
| A18–A20, A24 | `/account/billing`, `/account/billing/invoices/[id]` | account nav → Billing → invoice | `myInvoices`, `myInvoice`, `payInvoice`, `createSetupIntent` | working (card needs Stripe keys); pause / notice waiting on backend mutations |
