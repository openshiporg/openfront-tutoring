-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "role" TEXT,
    "family" TEXT,
    "onboardingStatus" TEXT DEFAULT 'not_started',
    "notifyByEmail" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetIssuedAt" TIMESTAMP(3),
    "passwordResetRedeemedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "canAccessDashboard" BOOLEAN NOT NULL DEFAULT false,
    "canManageSettings" BOOLEAN NOT NULL DEFAULT false,
    "canManageStaff" BOOLEAN NOT NULL DEFAULT false,
    "canManageLocations" BOOLEAN NOT NULL DEFAULT false,
    "canManagePrograms" BOOLEAN NOT NULL DEFAULT false,
    "canManageLeads" BOOLEAN NOT NULL DEFAULT false,
    "canManageFamilies" BOOLEAN NOT NULL DEFAULT false,
    "canManageSchedule" BOOLEAN NOT NULL DEFAULT false,
    "canMarkAttendance" BOOLEAN NOT NULL DEFAULT false,
    "canManageBilling" BOOLEAN NOT NULL DEFAULT false,
    "canIssueRefunds" BOOLEAN NOT NULL DEFAULT false,
    "canManagePayroll" BOOLEAN NOT NULL DEFAULT false,
    "canViewReports" BOOLEAN NOT NULL DEFAULT false,
    "canManageTutors" BOOLEAN NOT NULL DEFAULT false,
    "isTutor" BOOLEAN NOT NULL DEFAULT false,
    "canSeeOtherPeople" BOOLEAN NOT NULL DEFAULT false,
    "canEditOtherPeople" BOOLEAN NOT NULL DEFAULT false,
    "canManagePeople" BOOLEAN NOT NULL DEFAULT false,
    "canManageRoles" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "legalName" TEXT NOT NULL DEFAULT '',
    "logo_id" TEXT,
    "logo_filesize" INTEGER,
    "logo_width" INTEGER,
    "logo_height" INTEGER,
    "logo_extension" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "country" TEXT NOT NULL DEFAULT 'US',
    "supportEmail" TEXT NOT NULL DEFAULT '',
    "careersEmail" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "brandPrimary" TEXT NOT NULL DEFAULT '#1f5f8b',
    "brandAccent" TEXT NOT NULL DEFAULT '#f2a541',
    "about" TEXT NOT NULL DEFAULT '',
    "socialLinks" JSONB DEFAULT '{}',
    "kind" TEXT NOT NULL DEFAULT 'centre',
    "nextInvoiceNumber" INTEGER DEFAULT 1001,
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" INTEGER NOT NULL,
    "cancellationWindowHours" INTEGER NOT NULL DEFAULT 24,
    "lateCancelCharged" BOOLEAN NOT NULL DEFAULT true,
    "noShowCharged" BOOLEAN NOT NULL DEFAULT true,
    "excusedAbsencesPerMonth" INTEGER NOT NULL DEFAULT 1,
    "makeUpExpiryDays" INTEGER NOT NULL DEFAULT 60,
    "membershipRolloverPeriods" INTEGER NOT NULL DEFAULT 1,
    "membershipCancelNoticeDays" INTEGER NOT NULL DEFAULT 30,
    "pauseMinDays" INTEGER NOT NULL DEFAULT 14,
    "pauseMaxDays" INTEGER NOT NULL DEFAULT 28,
    "pausesPerYear" INTEGER NOT NULL DEFAULT 1,
    "pastDueRetryDays" JSONB DEFAULT '[3,7]',
    "suspendAfterDays" INTEGER NOT NULL DEFAULT 10,
    "siblingDiscountPercent" INTEGER NOT NULL DEFAULT 10,
    "offerExpiryHours" INTEGER NOT NULL DEFAULT 24,
    "freeRematches" INTEGER NOT NULL DEFAULT 1,
    "trialChargedOnRematch" BOOLEAN NOT NULL DEFAULT false,
    "tutorPaidOnLateCancelPercent" INTEGER NOT NULL DEFAULT 100,
    "tutorPaidOnNoShowPercent" INTEGER NOT NULL DEFAULT 100,
    "payrollPeriodDays" INTEGER NOT NULL DEFAULT 14,
    "progressReportEverySessions" INTEGER NOT NULL DEFAULT 12,
    "progressReportEveryWeeks" INTEGER NOT NULL DEFAULT 4,
    "reassessEveryWeeks" INTEGER NOT NULL DEFAULT 12,
    "lowBalanceMinutes" INTEGER NOT NULL DEFAULT 120,
    "bookingHorizonDays" INTEGER NOT NULL DEFAULT 42,
    "attendanceEditWindowHours" INTEGER NOT NULL DEFAULT 48,
    "assessmentCancelRefundHours" INTEGER NOT NULL DEFAULT 24,
    "assessmentFeeKeptOnLateCancel" BOOLEAN NOT NULL DEFAULT true,
    "enrolmentFeeWaivedWithinDays" INTEGER NOT NULL DEFAULT 90,
    "frontDeskRefundLimit" INTEGER NOT NULL DEFAULT 0,
    "reopenWindowDays" INTEGER NOT NULL DEFAULT 14,
    "policiesText" TEXT NOT NULL DEFAULT '',
    "jobsSecretHash" TEXT NOT NULL DEFAULT '',
    "lastDailyJobsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'US',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "openingHours" JSONB DEFAULT '{}',
    "taxRatePercent" DECIMAL(6,3) DEFAULT 0,
    "photo_id" TEXT,
    "photo_filesize" INTEGER,
    "photo_width" INTEGER,
    "photo_height" INTEGER,
    "photo_extension" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationMembership" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "location" TEXT,
    "role" TEXT NOT NULL DEFAULT 'front_desk',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "LocationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "location" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "kind" TEXT NOT NULL DEFAULT 'room',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Closure" (
    "id" TEXT NOT NULL,
    "location" TEXT,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Closure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'other',
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Level" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'grade',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "description" JSONB NOT NULL DEFAULT '[{"type":"paragraph","children":[{"text":""}]}]',
    "image_id" TEXT,
    "image_filesize" INTEGER,
    "image_width" INTEGER,
    "image_height" INTEGER,
    "image_extension" TEXT,
    "levelsFrom" TEXT,
    "levelsTo" TEXT,
    "deliveryModes" JSONB NOT NULL DEFAULT '["in_centre"]',
    "format" TEXT NOT NULL DEFAULT 'small_group',
    "maxStudentsPerSession" INTEGER NOT NULL DEFAULT 4,
    "sessionMinutes" INTEGER NOT NULL DEFAULT 60,
    "billingModel" TEXT NOT NULL DEFAULT 'managed',
    "requiresAssessment" BOOLEAN NOT NULL DEFAULT true,
    "assessmentFee" INTEGER NOT NULL DEFAULT 0,
    "assessmentMinutes" INTEGER NOT NULL DEFAULT 45,
    "allowsTrial" BOOLEAN NOT NULL DEFAULT false,
    "placementFee" INTEGER NOT NULL DEFAULT 0,
    "payAsYouGoPrice" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "outcomes" TEXT NOT NULL DEFAULT '',
    "faq" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "program" TEXT,
    "sessionsPerPeriod" INTEGER,
    "weeklyCapForUnlimited" INTEGER DEFAULT 5,
    "price" INTEGER NOT NULL DEFAULT 0,
    "enrolmentFee" INTEGER NOT NULL DEFAULT 0,
    "minimumTermMonths" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "features" JSONB DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'published',
    "sortOrder" INTEGER DEFAULT 0,
    "highlight" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "program" TEXT,
    "hours" INTEGER NOT NULL DEFAULT 10,
    "price" INTEGER NOT NULL DEFAULT 0,
    "expiryMonths" INTEGER NOT NULL DEFAULT 6,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'published',
    "sortOrder" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "percentOff" INTEGER,
    "amountOff" INTEGER,
    "appliesTo" TEXT NOT NULL DEFAULT 'any',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "maxUses" INTEGER,
    "uses" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "primaryLocation" TEXT,
    "billingEmail" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "stripeCustomerId" TEXT NOT NULL DEFAULT '',
    "defaultPaymentMethodId" TEXT NOT NULL DEFAULT '',
    "defaultPaymentMethodLabel" TEXT NOT NULL DEFAULT '',
    "payAsYouGoAllowed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "secondGuardianName" TEXT NOT NULL DEFAULT '',
    "secondGuardianEmail" TEXT NOT NULL DEFAULT '',
    "secondGuardianPhone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "sourceLead" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "family" TEXT,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "dateOfBirth" TIMESTAMP(3),
    "level" TEXT,
    "school" TEXT NOT NULL DEFAULT '',
    "photo_id" TEXT,
    "photo_filesize" INTEGER,
    "photo_width" INTEGER,
    "photo_height" INTEGER,
    "photo_extension" TEXT,
    "learningNotes" TEXT NOT NULL DEFAULT '',
    "medicalNotes" TEXT NOT NULL DEFAULT '',
    "pickupPeople" JSONB DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'prospect',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "guardianName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "studentName" TEXT NOT NULL DEFAULT '',
    "level" TEXT,
    "program" TEXT,
    "location" TEXT,
    "preferredMode" TEXT,
    "preferredTimes" TEXT NOT NULL DEFAULT '',
    "area" TEXT NOT NULL DEFAULT '',
    "intent" TEXT NOT NULL DEFAULT 'enquiry',
    "message" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'website',
    "status" TEXT NOT NULL DEFAULT 'new',
    "lostReason" TEXT NOT NULL DEFAULT '',
    "owner" TEXT,
    "family" TEXT,
    "student" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tutor" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "displayName" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "photo_id" TEXT,
    "photo_filesize" INTEGER,
    "photo_width" INTEGER,
    "photo_height" INTEGER,
    "photo_extension" TEXT,
    "photoUrl" TEXT NOT NULL DEFAULT '',
    "headline" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "education" TEXT NOT NULL DEFAULT '',
    "yearsExperience" INTEGER DEFAULT 0,
    "employmentType" TEXT NOT NULL DEFAULT 'contractor',
    "deliveryModes" JSONB NOT NULL DEFAULT '["in_centre"]',
    "travelAreas" TEXT NOT NULL DEFAULT '',
    "travelRadiusKm" INTEGER,
    "homeLocation" TEXT,
    "defaultPayRate" INTEGER NOT NULL DEFAULT 0,
    "meetingUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'onboarding',
    "publicProfile" BOOLEAN NOT NULL DEFAULT false,
    "application" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Tutor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorSubject" (
    "id" TEXT NOT NULL,
    "tutor" TEXT,
    "subject" TEXT,
    "levelFrom" TEXT,
    "levelTo" TEXT,
    "payRate" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "TutorSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorAvailability" (
    "id" TEXT NOT NULL,
    "tutor" TEXT,
    "weekday" INTEGER NOT NULL DEFAULT 1,
    "startMinute" INTEGER NOT NULL DEFAULT 900,
    "endMinute" INTEGER NOT NULL DEFAULT 1200,
    "mode" TEXT NOT NULL DEFAULT 'in_centre',
    "location" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "TutorAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorTimeOff" (
    "id" TEXT NOT NULL,
    "tutor" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "TutorTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorCredential" (
    "id" TEXT NOT NULL,
    "tutor" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'background_check',
    "document_filesize" INTEGER,
    "document_filename" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "TutorCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorApplication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "subjectsText" TEXT NOT NULL DEFAULT '',
    "levels" TEXT NOT NULL DEFAULT '',
    "modes" JSONB NOT NULL DEFAULT '[]',
    "areas" TEXT NOT NULL DEFAULT '',
    "availability" JSONB DEFAULT '{}',
    "cv_filesize" INTEGER,
    "cv_filename" TEXT,
    "references" JSONB DEFAULT '[]',
    "coverNote" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'applied',
    "reviewer" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "TutorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "student" TEXT,
    "family" TEXT,
    "program" TEXT,
    "subject" TEXT,
    "location" TEXT,
    "room" TEXT,
    "assessor" TEXT,
    "assessorUser" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'in_centre',
    "kind" TEXT NOT NULL DEFAULT 'initial',
    "scheduledAt" TIMESTAMP(3),
    "minutes" INTEGER NOT NULL DEFAULT 45,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "slotKey" TEXT,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "feeRefunded" BOOLEAN NOT NULL DEFAULT false,
    "invoice" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "recommendation" TEXT NOT NULL DEFAULT '',
    "recommendedPlan" TEXT,
    "recommendedPackage" TEXT,
    "recommendedSessionsPerWeek" INTEGER,
    "lead" TEXT,
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMP(3),
    "rescheduledFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentResult" (
    "id" TEXT NOT NULL,
    "assessment" TEXT,
    "skill" TEXT NOT NULL DEFAULT '',
    "strand" TEXT NOT NULL DEFAULT '',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "levelEquivalent" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "AssessmentResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningPlan" (
    "id" TEXT NOT NULL,
    "student" TEXT,
    "subject" TEXT,
    "program" TEXT,
    "version" INTEGER DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summary" TEXT NOT NULL DEFAULT '',
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "sessionsPerWeek" INTEGER DEFAULT 2,
    "totalHours" INTEGER,
    "recommendedPlan" TEXT,
    "recommendedPackage" TEXT,
    "baselineAssessment" TEXT,
    "previousVersion" TEXT,
    "declineReason" TEXT NOT NULL DEFAULT '',
    "proposedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "LearningPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanGoal" (
    "id" TEXT NOT NULL,
    "plan" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "skill" TEXT NOT NULL DEFAULT '',
    "baseline" TEXT NOT NULL DEFAULT '',
    "target" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "masteredAt" TIMESTAMP(3),
    "sortOrder" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PlanGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "student" TEXT,
    "family" TEXT,
    "program" TEXT,
    "location" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'in_centre',
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "fundingType" TEXT NOT NULL DEFAULT 'membership',
    "membership" TEXT,
    "studentPackage" TEXT,
    "tutor" TEXT,
    "plan" TEXT,
    "preferredTimes" JSONB DEFAULT '[]',
    "homeAddress" TEXT NOT NULL DEFAULT '',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "endReason" TEXT NOT NULL DEFAULT '',
    "rematchCount" INTEGER DEFAULT 0,
    "trialAttendedAt" TIMESTAMP(3),
    "tutorConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "enrollment" TEXT,
    "tutor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "openKey" TEXT,
    "payRate" INTEGER NOT NULL DEFAULT 0,
    "proposedSlots" JSONB DEFAULT '[]',
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT NOT NULL DEFAULT '',
    "sentBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSeries" (
    "id" TEXT NOT NULL,
    "program" TEXT,
    "subject" TEXT,
    "location" TEXT,
    "room" TEXT,
    "tutor" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'in_centre',
    "weekday" INTEGER NOT NULL DEFAULT 1,
    "startMinute" INTEGER NOT NULL DEFAULT 960,
    "minutes" INTEGER NOT NULL DEFAULT 60,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "enrollment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "meetingUrl" TEXT NOT NULL DEFAULT '',
    "generatedThrough" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "SessionSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "series" TEXT,
    "program" TEXT,
    "subject" TEXT,
    "location" TEXT,
    "room" TEXT,
    "tutor" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'in_centre',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "meetingUrl" TEXT NOT NULL DEFAULT '',
    "isTrial" BOOLEAN NOT NULL DEFAULT false,
    "substituteFor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "session" TEXT,
    "student" TEXT,
    "family" TEXT,
    "enrollment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'booked',
    "activeKey" TEXT,
    "source" TEXT NOT NULL DEFAULT 'staff',
    "creditGrant" TEXT,
    "payAsYouGo" BOOLEAN NOT NULL DEFAULT false,
    "invoice" TEXT,
    "minutes" INTEGER DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "markedBy" TEXT,
    "markedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "lateReason" TEXT NOT NULL DEFAULT '',
    "makeUpGrant" TEXT,
    "payLine" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionReport" (
    "id" TEXT NOT NULL,
    "booking" TEXT,
    "session" TEXT,
    "student" TEXT,
    "tutor" TEXT,
    "topicsCovered" TEXT NOT NULL DEFAULT '',
    "wentWell" TEXT NOT NULL DEFAULT '',
    "toImprove" TEXT NOT NULL DEFAULT '',
    "homework" TEXT NOT NULL DEFAULT '',
    "homeworkDueAt" TIMESTAMP(3),
    "homeworkStatus" TEXT,
    "effort" INTEGER,
    "staffNote" TEXT NOT NULL DEFAULT '',
    "attachment_filesize" INTEGER,
    "attachment_filename" TEXT,
    "publishedAt" TIMESTAMP(3),
    "guardianSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "SessionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "session" TEXT,
    "student" TEXT,
    "family" TEXT,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "activeKey" TEXT,
    "position" INTEGER DEFAULT 0,
    "promotedAt" TIMESTAMP(3),
    "booking" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressReport" (
    "id" TEXT NOT NULL,
    "student" TEXT,
    "enrollment" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "sessionsAttended" INTEGER DEFAULT 0,
    "sessionsMissed" INTEGER DEFAULT 0,
    "narrative" TEXT NOT NULL DEFAULT '',
    "goalsSnapshot" JSONB DEFAULT '[]',
    "nextSteps" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "author" TEXT,
    "authorTutor" TEXT,
    "withdrawReason" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "ProgressReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "family" TEXT,
    "student" TEXT,
    "plan" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "price" INTEGER DEFAULT 0,
    "discountPercent" INTEGER DEFAULT 0,
    "sessionsPerPeriod" INTEGER,
    "weeklyCap" INTEGER,
    "startedAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "pausedFrom" TIMESTAMP(3),
    "pausedUntil" TIMESTAMP(3),
    "pauseRequestedFrom" TIMESTAMP(3),
    "pauseRequestedUntil" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "pastDueSince" TIMESTAMP(3),
    "lastPauseAt" TIMESTAMP(3),
    "pendingPlan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentPackage" (
    "id" TEXT NOT NULL,
    "family" TEXT,
    "student" TEXT,
    "package" TEXT,
    "hours" INTEGER DEFAULT 0,
    "price" INTEGER DEFAULT 0,
    "purchasedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "invoice" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "StudentPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditGrant" (
    "id" TEXT NOT NULL,
    "family" TEXT,
    "student" TEXT,
    "program" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'goodwill',
    "membership" TEXT,
    "studentPackage" TEXT,
    "rolledFrom" TEXT,
    "minutesGranted" INTEGER DEFAULT 0,
    "minutesAvailable" INTEGER DEFAULT 0,
    "unlimited" BOOLEAN NOT NULL DEFAULT false,
    "weeklyCap" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "CreditGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditEntry" (
    "id" TEXT NOT NULL,
    "grant" TEXT,
    "type" TEXT NOT NULL DEFAULT 'grant',
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "booking" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "CreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" INTEGER,
    "family" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "subtotal" INTEGER DEFAULT 0,
    "discount" INTEGER DEFAULT 0,
    "tax" INTEGER DEFAULT 0,
    "total" INTEGER DEFAULT 0,
    "amountPaid" INTEGER DEFAULT 0,
    "amountCredited" INTEGER DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "promoCode" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "fulfilment" JSONB DEFAULT '{}',
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoice" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmount" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "student" TEXT,
    "program" TEXT,
    "booking" TEXT,
    "membership" TEXT,
    "studentPackage" TEXT,
    "assessment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "invoice" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "issuedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoice" TEXT,
    "family" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" TEXT NOT NULL DEFAULT 'card',
    "reference" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'captured',
    "paymentSession" TEXT,
    "providerPaymentId" TEXT,
    "receivedBy" TEXT,
    "refundedAmount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "payment" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "providerRefundId" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "failureReason" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAttempt" (
    "id" TEXT NOT NULL,
    "membership" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" TIMESTAMP(3),
    "invoice" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount" INTEGER DEFAULT 0,
    "requestHash" TEXT NOT NULL DEFAULT '',
    "leaseExpiresAt" TIMESTAMP(3),
    "providerPaymentId" TEXT NOT NULL DEFAULT '',
    "failureCode" TEXT NOT NULL DEFAULT '',
    "failureMessage" TEXT NOT NULL DEFAULT '',
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "BillingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayLine" (
    "id" TEXT NOT NULL,
    "tutor" TEXT,
    "session" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'session',
    "workedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "rate" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'accrued',
    "activeKey" TEXT,
    "payrollRun" TEXT,
    "voidReason" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PayLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "location" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "payments" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "isInstalled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "credentials" JSONB DEFAULT '{}',
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSession" (
    "id" TEXT NOT NULL,
    "invoice" TEXT,
    "paymentProvider" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'invoice',
    "family" TEXT,
    "idempotencyKeyHash" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "providerPaymentId" TEXT NOT NULL DEFAULT '',
    "clientSecret" TEXT NOT NULL DEFAULT '',
    "offSession" BOOLEAN NOT NULL DEFAULT false,
    "failureMessage" TEXT NOT NULL DEFAULT '',
    "capturedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "refundedAmount" INTEGER DEFAULT 0,
    "metadata" JSONB DEFAULT '{}',
    "reviewReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PaymentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "replayKey" TEXT NOT NULL DEFAULT '',
    "providerCode" TEXT NOT NULL DEFAULT '',
    "providerEventId" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT '',
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL DEFAULT '',
    "processedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "title" TEXT NOT NULL DEFAULT '',
    "family" TEXT,
    "student" TEXT,
    "lead" TEXT,
    "location" TEXT,
    "owner" TEXT,
    "relatedType" TEXT NOT NULL DEFAULT '',
    "relatedId" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "openKey" TEXT,
    "outcomeNote" TEXT NOT NULL DEFAULT '',
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "family" TEXT,
    "sender" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'outbound',
    "channel" TEXT NOT NULL DEFAULT 'email',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "visibleToFamily" BOOLEAN NOT NULL DEFAULT true,
    "threadKey" TEXT NOT NULL DEFAULT '',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL DEFAULT '',
    "template" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "relatedType" TEXT NOT NULL DEFAULT '',
    "relatedId" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "family" TEXT,
    "tutor" TEXT,
    "location" TEXT,
    "program" TEXT,
    "authorName" TEXT NOT NULL DEFAULT '',
    "rating" INTEGER NOT NULL DEFAULT 5,
    "text" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeEvent" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL DEFAULT '',
    "aggregateId" TEXT NOT NULL DEFAULT '',
    "from" TEXT NOT NULL DEFAULT '',
    "to" TEXT NOT NULL DEFAULT '',
    "actor" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "data" JSONB DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "ChangeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandReceipt" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT '',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "aggregateType" TEXT NOT NULL DEFAULT '',
    "aggregateId" TEXT NOT NULL DEFAULT '',
    "location" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "actorId" TEXT NOT NULL DEFAULT '',
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "CommandReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthApp" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL DEFAULT '',
    "clientSecret" TEXT NOT NULL DEFAULT '',
    "tokenEndpointAuthMethod" TEXT DEFAULT 'client_secret_post',
    "redirectUris" JSONB DEFAULT '[]',
    "scopes" JSONB DEFAULT '["mcp:read","mcp:write"]',
    "webhookUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'active',
    "installUrl" TEXT NOT NULL DEFAULT '',
    "uninstallUrl" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB DEFAULT '{}',
    "developerEmail" TEXT NOT NULL DEFAULT '',
    "privacyPolicyUrl" TEXT NOT NULL DEFAULT '',
    "termsOfServiceUrl" TEXT NOT NULL DEFAULT '',
    "supportUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "OAuthApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL DEFAULT '',
    "user" TEXT,
    "scopes" JSONB DEFAULT '[]',
    "redirectUri" TEXT NOT NULL DEFAULT '',
    "resource" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "isRevoked" TEXT DEFAULT 'false',
    "authorizationCode" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "codeChallenge" TEXT NOT NULL DEFAULT '',
    "codeChallengeMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_Location_programs" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_Location_programs_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_Location_tutors" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_Location_tutors_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_TutorApplication_subjects" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TutorApplication_subjects_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_Program_subjects" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_Program_subjects_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_Lead_subjects" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_Lead_subjects_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_family_idx" ON "User"("family");

-- CreateIndex
CREATE INDEX "User_createdBy_idx" ON "User"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "Role_createdBy_idx" ON "Role"("createdBy");

-- CreateIndex
CREATE INDEX "Business_createdBy_idx" ON "Business"("createdBy");

-- CreateIndex
CREATE INDEX "BusinessSettings_createdBy_idx" ON "BusinessSettings"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Location_slug_key" ON "Location"("slug");

-- CreateIndex
CREATE INDEX "Location_status_idx" ON "Location"("status");

-- CreateIndex
CREATE INDEX "Location_createdBy_idx" ON "Location"("createdBy");

-- CreateIndex
CREATE INDEX "LocationMembership_user_idx" ON "LocationMembership"("user");

-- CreateIndex
CREATE INDEX "LocationMembership_location_idx" ON "LocationMembership"("location");

-- CreateIndex
CREATE INDEX "LocationMembership_createdBy_idx" ON "LocationMembership"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "LocationMembership_user_location_key" ON "LocationMembership"("user", "location");

-- CreateIndex
CREATE INDEX "Room_location_idx" ON "Room"("location");

-- CreateIndex
CREATE INDEX "Room_createdBy_idx" ON "Room"("createdBy");

-- CreateIndex
CREATE INDEX "Closure_location_idx" ON "Closure"("location");

-- CreateIndex
CREATE INDEX "Closure_createdBy_idx" ON "Closure"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_slug_key" ON "Subject"("slug");

-- CreateIndex
CREATE INDEX "Subject_createdBy_idx" ON "Subject"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Level_name_key" ON "Level"("name");

-- CreateIndex
CREATE INDEX "Level_createdBy_idx" ON "Level"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Program_slug_key" ON "Program"("slug");

-- CreateIndex
CREATE INDEX "Program_levelsFrom_idx" ON "Program"("levelsFrom");

-- CreateIndex
CREATE INDEX "Program_levelsTo_idx" ON "Program"("levelsTo");

-- CreateIndex
CREATE INDEX "Program_status_idx" ON "Program"("status");

-- CreateIndex
CREATE INDEX "Program_createdBy_idx" ON "Program"("createdBy");

-- CreateIndex
CREATE INDEX "MembershipPlan_program_idx" ON "MembershipPlan"("program");

-- CreateIndex
CREATE INDEX "MembershipPlan_status_idx" ON "MembershipPlan"("status");

-- CreateIndex
CREATE INDEX "MembershipPlan_createdBy_idx" ON "MembershipPlan"("createdBy");

-- CreateIndex
CREATE INDEX "Package_program_idx" ON "Package"("program");

-- CreateIndex
CREATE INDEX "Package_status_idx" ON "Package"("status");

-- CreateIndex
CREATE INDEX "Package_createdBy_idx" ON "Package"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_createdBy_idx" ON "PromoCode"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Family_sourceLead_key" ON "Family"("sourceLead");

-- CreateIndex
CREATE INDEX "Family_primaryLocation_idx" ON "Family"("primaryLocation");

-- CreateIndex
CREATE INDEX "Family_billingEmail_idx" ON "Family"("billingEmail");

-- CreateIndex
CREATE INDEX "Family_createdBy_idx" ON "Family"("createdBy");

-- CreateIndex
CREATE INDEX "Student_family_idx" ON "Student"("family");

-- CreateIndex
CREATE INDEX "Student_level_idx" ON "Student"("level");

-- CreateIndex
CREATE INDEX "Student_status_idx" ON "Student"("status");

-- CreateIndex
CREATE INDEX "Student_createdBy_idx" ON "Student"("createdBy");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "Lead_level_idx" ON "Lead"("level");

-- CreateIndex
CREATE INDEX "Lead_program_idx" ON "Lead"("program");

-- CreateIndex
CREATE INDEX "Lead_location_idx" ON "Lead"("location");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_owner_idx" ON "Lead"("owner");

-- CreateIndex
CREATE INDEX "Lead_family_idx" ON "Lead"("family");

-- CreateIndex
CREATE INDEX "Lead_student_idx" ON "Lead"("student");

-- CreateIndex
CREATE INDEX "Lead_createdBy_idx" ON "Lead"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Tutor_user_key" ON "Tutor"("user");

-- CreateIndex
CREATE UNIQUE INDEX "Tutor_slug_key" ON "Tutor"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tutor_application_key" ON "Tutor"("application");

-- CreateIndex
CREATE INDEX "Tutor_homeLocation_idx" ON "Tutor"("homeLocation");

-- CreateIndex
CREATE INDEX "Tutor_status_idx" ON "Tutor"("status");

-- CreateIndex
CREATE INDEX "Tutor_createdBy_idx" ON "Tutor"("createdBy");

-- CreateIndex
CREATE INDEX "TutorSubject_tutor_idx" ON "TutorSubject"("tutor");

-- CreateIndex
CREATE INDEX "TutorSubject_subject_idx" ON "TutorSubject"("subject");

-- CreateIndex
CREATE INDEX "TutorSubject_levelFrom_idx" ON "TutorSubject"("levelFrom");

-- CreateIndex
CREATE INDEX "TutorSubject_levelTo_idx" ON "TutorSubject"("levelTo");

-- CreateIndex
CREATE INDEX "TutorSubject_createdBy_idx" ON "TutorSubject"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "TutorSubject_tutor_subject_key" ON "TutorSubject"("tutor", "subject");

-- CreateIndex
CREATE INDEX "TutorAvailability_tutor_idx" ON "TutorAvailability"("tutor");

-- CreateIndex
CREATE INDEX "TutorAvailability_location_idx" ON "TutorAvailability"("location");

-- CreateIndex
CREATE INDEX "TutorAvailability_createdBy_idx" ON "TutorAvailability"("createdBy");

-- CreateIndex
CREATE INDEX "TutorTimeOff_tutor_idx" ON "TutorTimeOff"("tutor");

-- CreateIndex
CREATE INDEX "TutorTimeOff_status_idx" ON "TutorTimeOff"("status");

-- CreateIndex
CREATE INDEX "TutorTimeOff_createdBy_idx" ON "TutorTimeOff"("createdBy");

-- CreateIndex
CREATE INDEX "TutorCredential_tutor_idx" ON "TutorCredential"("tutor");

-- CreateIndex
CREATE INDEX "TutorCredential_status_idx" ON "TutorCredential"("status");

-- CreateIndex
CREATE INDEX "TutorCredential_verifiedBy_idx" ON "TutorCredential"("verifiedBy");

-- CreateIndex
CREATE INDEX "TutorCredential_createdBy_idx" ON "TutorCredential"("createdBy");

-- CreateIndex
CREATE INDEX "TutorApplication_email_idx" ON "TutorApplication"("email");

-- CreateIndex
CREATE INDEX "TutorApplication_status_idx" ON "TutorApplication"("status");

-- CreateIndex
CREATE INDEX "TutorApplication_reviewer_idx" ON "TutorApplication"("reviewer");

-- CreateIndex
CREATE INDEX "TutorApplication_createdBy_idx" ON "TutorApplication"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Assessment_slotKey_key" ON "Assessment"("slotKey");

-- CreateIndex
CREATE INDEX "Assessment_student_idx" ON "Assessment"("student");

-- CreateIndex
CREATE INDEX "Assessment_family_idx" ON "Assessment"("family");

-- CreateIndex
CREATE INDEX "Assessment_program_idx" ON "Assessment"("program");

-- CreateIndex
CREATE INDEX "Assessment_subject_idx" ON "Assessment"("subject");

-- CreateIndex
CREATE INDEX "Assessment_location_idx" ON "Assessment"("location");

-- CreateIndex
CREATE INDEX "Assessment_room_idx" ON "Assessment"("room");

-- CreateIndex
CREATE INDEX "Assessment_assessor_idx" ON "Assessment"("assessor");

-- CreateIndex
CREATE INDEX "Assessment_assessorUser_idx" ON "Assessment"("assessorUser");

-- CreateIndex
CREATE INDEX "Assessment_scheduledAt_idx" ON "Assessment"("scheduledAt");

-- CreateIndex
CREATE INDEX "Assessment_status_idx" ON "Assessment"("status");

-- CreateIndex
CREATE INDEX "Assessment_invoice_idx" ON "Assessment"("invoice");

-- CreateIndex
CREATE INDEX "Assessment_recommendedPlan_idx" ON "Assessment"("recommendedPlan");

-- CreateIndex
CREATE INDEX "Assessment_recommendedPackage_idx" ON "Assessment"("recommendedPackage");

-- CreateIndex
CREATE INDEX "Assessment_lead_idx" ON "Assessment"("lead");

-- CreateIndex
CREATE INDEX "Assessment_rescheduledFrom_idx" ON "Assessment"("rescheduledFrom");

-- CreateIndex
CREATE INDEX "Assessment_createdBy_idx" ON "Assessment"("createdBy");

-- CreateIndex
CREATE INDEX "Assessment_assessor_scheduledAt_idx" ON "Assessment"("assessor", "scheduledAt");

-- CreateIndex
CREATE INDEX "Assessment_room_scheduledAt_idx" ON "Assessment"("room", "scheduledAt");

-- CreateIndex
CREATE INDEX "AssessmentResult_assessment_idx" ON "AssessmentResult"("assessment");

-- CreateIndex
CREATE INDEX "AssessmentResult_createdBy_idx" ON "AssessmentResult"("createdBy");

-- CreateIndex
CREATE INDEX "LearningPlan_student_idx" ON "LearningPlan"("student");

-- CreateIndex
CREATE INDEX "LearningPlan_subject_idx" ON "LearningPlan"("subject");

-- CreateIndex
CREATE INDEX "LearningPlan_program_idx" ON "LearningPlan"("program");

-- CreateIndex
CREATE INDEX "LearningPlan_status_idx" ON "LearningPlan"("status");

-- CreateIndex
CREATE INDEX "LearningPlan_recommendedPlan_idx" ON "LearningPlan"("recommendedPlan");

-- CreateIndex
CREATE INDEX "LearningPlan_recommendedPackage_idx" ON "LearningPlan"("recommendedPackage");

-- CreateIndex
CREATE INDEX "LearningPlan_baselineAssessment_idx" ON "LearningPlan"("baselineAssessment");

-- CreateIndex
CREATE INDEX "LearningPlan_previousVersion_idx" ON "LearningPlan"("previousVersion");

-- CreateIndex
CREATE INDEX "LearningPlan_createdBy_idx" ON "LearningPlan"("createdBy");

-- CreateIndex
CREATE INDEX "PlanGoal_plan_idx" ON "PlanGoal"("plan");

-- CreateIndex
CREATE INDEX "PlanGoal_status_idx" ON "PlanGoal"("status");

-- CreateIndex
CREATE INDEX "PlanGoal_createdBy_idx" ON "PlanGoal"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_membership_key" ON "Enrollment"("membership");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_studentPackage_key" ON "Enrollment"("studentPackage");

-- CreateIndex
CREATE INDEX "Enrollment_student_idx" ON "Enrollment"("student");

-- CreateIndex
CREATE INDEX "Enrollment_family_idx" ON "Enrollment"("family");

-- CreateIndex
CREATE INDEX "Enrollment_program_idx" ON "Enrollment"("program");

-- CreateIndex
CREATE INDEX "Enrollment_location_idx" ON "Enrollment"("location");

-- CreateIndex
CREATE INDEX "Enrollment_status_idx" ON "Enrollment"("status");

-- CreateIndex
CREATE INDEX "Enrollment_tutor_idx" ON "Enrollment"("tutor");

-- CreateIndex
CREATE INDEX "Enrollment_plan_idx" ON "Enrollment"("plan");

-- CreateIndex
CREATE INDEX "Enrollment_createdBy_idx" ON "Enrollment"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_openKey_key" ON "Offer"("openKey");

-- CreateIndex
CREATE INDEX "Offer_enrollment_idx" ON "Offer"("enrollment");

-- CreateIndex
CREATE INDEX "Offer_tutor_idx" ON "Offer"("tutor");

-- CreateIndex
CREATE INDEX "Offer_status_idx" ON "Offer"("status");

-- CreateIndex
CREATE INDEX "Offer_sentBy_idx" ON "Offer"("sentBy");

-- CreateIndex
CREATE INDEX "Offer_createdBy_idx" ON "Offer"("createdBy");

-- CreateIndex
CREATE INDEX "SessionSeries_program_idx" ON "SessionSeries"("program");

-- CreateIndex
CREATE INDEX "SessionSeries_subject_idx" ON "SessionSeries"("subject");

-- CreateIndex
CREATE INDEX "SessionSeries_location_idx" ON "SessionSeries"("location");

-- CreateIndex
CREATE INDEX "SessionSeries_room_idx" ON "SessionSeries"("room");

-- CreateIndex
CREATE INDEX "SessionSeries_tutor_idx" ON "SessionSeries"("tutor");

-- CreateIndex
CREATE INDEX "SessionSeries_enrollment_idx" ON "SessionSeries"("enrollment");

-- CreateIndex
CREATE INDEX "SessionSeries_status_idx" ON "SessionSeries"("status");

-- CreateIndex
CREATE INDEX "SessionSeries_createdBy_idx" ON "SessionSeries"("createdBy");

-- CreateIndex
CREATE INDEX "Session_series_idx" ON "Session"("series");

-- CreateIndex
CREATE INDEX "Session_program_idx" ON "Session"("program");

-- CreateIndex
CREATE INDEX "Session_subject_idx" ON "Session"("subject");

-- CreateIndex
CREATE INDEX "Session_location_idx" ON "Session"("location");

-- CreateIndex
CREATE INDEX "Session_room_idx" ON "Session"("room");

-- CreateIndex
CREATE INDEX "Session_tutor_idx" ON "Session"("tutor");

-- CreateIndex
CREATE INDEX "Session_status_idx" ON "Session"("status");

-- CreateIndex
CREATE INDEX "Session_substituteFor_idx" ON "Session"("substituteFor");

-- CreateIndex
CREATE INDEX "Session_createdBy_idx" ON "Session"("createdBy");

-- CreateIndex
CREATE INDEX "Session_tutor_startsAt_idx" ON "Session"("tutor", "startsAt");

-- CreateIndex
CREATE INDEX "Session_room_startsAt_idx" ON "Session"("room", "startsAt");

-- CreateIndex
CREATE INDEX "Session_location_startsAt_idx" ON "Session"("location", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_series_startsAt_key" ON "Session"("series", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_activeKey_key" ON "Booking"("activeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_makeUpGrant_key" ON "Booking"("makeUpGrant");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_payLine_key" ON "Booking"("payLine");

-- CreateIndex
CREATE INDEX "Booking_session_idx" ON "Booking"("session");

-- CreateIndex
CREATE INDEX "Booking_student_idx" ON "Booking"("student");

-- CreateIndex
CREATE INDEX "Booking_family_idx" ON "Booking"("family");

-- CreateIndex
CREATE INDEX "Booking_enrollment_idx" ON "Booking"("enrollment");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_creditGrant_idx" ON "Booking"("creditGrant");

-- CreateIndex
CREATE INDEX "Booking_invoice_idx" ON "Booking"("invoice");

-- CreateIndex
CREATE INDEX "Booking_markedBy_idx" ON "Booking"("markedBy");

-- CreateIndex
CREATE INDEX "Booking_cancelledBy_idx" ON "Booking"("cancelledBy");

-- CreateIndex
CREATE INDEX "Booking_createdBy_idx" ON "Booking"("createdBy");

-- CreateIndex
CREATE INDEX "Booking_student_status_idx" ON "Booking"("student", "status");

-- CreateIndex
CREATE INDEX "SessionReport_booking_idx" ON "SessionReport"("booking");

-- CreateIndex
CREATE INDEX "SessionReport_session_idx" ON "SessionReport"("session");

-- CreateIndex
CREATE INDEX "SessionReport_student_idx" ON "SessionReport"("student");

-- CreateIndex
CREATE INDEX "SessionReport_tutor_idx" ON "SessionReport"("tutor");

-- CreateIndex
CREATE INDEX "SessionReport_createdBy_idx" ON "SessionReport"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_activeKey_key" ON "WaitlistEntry"("activeKey");

-- CreateIndex
CREATE INDEX "WaitlistEntry_session_idx" ON "WaitlistEntry"("session");

-- CreateIndex
CREATE INDEX "WaitlistEntry_student_idx" ON "WaitlistEntry"("student");

-- CreateIndex
CREATE INDEX "WaitlistEntry_family_idx" ON "WaitlistEntry"("family");

-- CreateIndex
CREATE INDEX "WaitlistEntry_status_idx" ON "WaitlistEntry"("status");

-- CreateIndex
CREATE INDEX "WaitlistEntry_booking_idx" ON "WaitlistEntry"("booking");

-- CreateIndex
CREATE INDEX "WaitlistEntry_createdBy_idx" ON "WaitlistEntry"("createdBy");

-- CreateIndex
CREATE INDEX "ProgressReport_student_idx" ON "ProgressReport"("student");

-- CreateIndex
CREATE INDEX "ProgressReport_enrollment_idx" ON "ProgressReport"("enrollment");

-- CreateIndex
CREATE INDEX "ProgressReport_status_idx" ON "ProgressReport"("status");

-- CreateIndex
CREATE INDEX "ProgressReport_author_idx" ON "ProgressReport"("author");

-- CreateIndex
CREATE INDEX "ProgressReport_authorTutor_idx" ON "ProgressReport"("authorTutor");

-- CreateIndex
CREATE INDEX "ProgressReport_createdBy_idx" ON "ProgressReport"("createdBy");

-- CreateIndex
CREATE INDEX "Membership_family_idx" ON "Membership"("family");

-- CreateIndex
CREATE INDEX "Membership_student_idx" ON "Membership"("student");

-- CreateIndex
CREATE INDEX "Membership_plan_idx" ON "Membership"("plan");

-- CreateIndex
CREATE INDEX "Membership_status_idx" ON "Membership"("status");

-- CreateIndex
CREATE INDEX "Membership_pendingPlan_idx" ON "Membership"("pendingPlan");

-- CreateIndex
CREATE INDEX "Membership_createdBy_idx" ON "Membership"("createdBy");

-- CreateIndex
CREATE INDEX "StudentPackage_family_idx" ON "StudentPackage"("family");

-- CreateIndex
CREATE INDEX "StudentPackage_student_idx" ON "StudentPackage"("student");

-- CreateIndex
CREATE INDEX "StudentPackage_package_idx" ON "StudentPackage"("package");

-- CreateIndex
CREATE INDEX "StudentPackage_invoice_idx" ON "StudentPackage"("invoice");

-- CreateIndex
CREATE INDEX "StudentPackage_status_idx" ON "StudentPackage"("status");

-- CreateIndex
CREATE INDEX "StudentPackage_createdBy_idx" ON "StudentPackage"("createdBy");

-- CreateIndex
CREATE INDEX "CreditGrant_family_idx" ON "CreditGrant"("family");

-- CreateIndex
CREATE INDEX "CreditGrant_student_idx" ON "CreditGrant"("student");

-- CreateIndex
CREATE INDEX "CreditGrant_program_idx" ON "CreditGrant"("program");

-- CreateIndex
CREATE INDEX "CreditGrant_membership_idx" ON "CreditGrant"("membership");

-- CreateIndex
CREATE INDEX "CreditGrant_studentPackage_idx" ON "CreditGrant"("studentPackage");

-- CreateIndex
CREATE INDEX "CreditGrant_rolledFrom_idx" ON "CreditGrant"("rolledFrom");

-- CreateIndex
CREATE INDEX "CreditGrant_status_idx" ON "CreditGrant"("status");

-- CreateIndex
CREATE INDEX "CreditGrant_createdBy_idx" ON "CreditGrant"("createdBy");

-- CreateIndex
CREATE INDEX "CreditGrant_family_student_status_idx" ON "CreditGrant"("family", "student", "status");

-- CreateIndex
CREATE INDEX "CreditEntry_grant_idx" ON "CreditEntry"("grant");

-- CreateIndex
CREATE INDEX "CreditEntry_booking_idx" ON "CreditEntry"("booking");

-- CreateIndex
CREATE INDEX "CreditEntry_actor_idx" ON "CreditEntry"("actor");

-- CreateIndex
CREATE INDEX "CreditEntry_createdBy_idx" ON "CreditEntry"("createdBy");

-- CreateIndex
CREATE INDEX "CreditEntry_grant_type_idx" ON "CreditEntry"("grant", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_family_idx" ON "Invoice"("family");

-- CreateIndex
CREATE INDEX "Invoice_location_idx" ON "Invoice"("location");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_promoCode_idx" ON "Invoice"("promoCode");

-- CreateIndex
CREATE INDEX "Invoice_createdBy_idx" ON "Invoice"("createdBy");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoice_idx" ON "InvoiceLine"("invoice");

-- CreateIndex
CREATE INDEX "InvoiceLine_student_idx" ON "InvoiceLine"("student");

-- CreateIndex
CREATE INDEX "InvoiceLine_program_idx" ON "InvoiceLine"("program");

-- CreateIndex
CREATE INDEX "InvoiceLine_booking_idx" ON "InvoiceLine"("booking");

-- CreateIndex
CREATE INDEX "InvoiceLine_membership_idx" ON "InvoiceLine"("membership");

-- CreateIndex
CREATE INDEX "InvoiceLine_studentPackage_idx" ON "InvoiceLine"("studentPackage");

-- CreateIndex
CREATE INDEX "InvoiceLine_assessment_idx" ON "InvoiceLine"("assessment");

-- CreateIndex
CREATE INDEX "InvoiceLine_createdBy_idx" ON "InvoiceLine"("createdBy");

-- CreateIndex
CREATE INDEX "CreditNote_invoice_idx" ON "CreditNote"("invoice");

-- CreateIndex
CREATE INDEX "CreditNote_issuedBy_idx" ON "CreditNote"("issuedBy");

-- CreateIndex
CREATE INDEX "CreditNote_createdBy_idx" ON "CreditNote"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentSession_key" ON "Payment"("paymentSession");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_invoice_idx" ON "Payment"("invoice");

-- CreateIndex
CREATE INDEX "Payment_family_idx" ON "Payment"("family");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_receivedBy_idx" ON "Payment"("receivedBy");

-- CreateIndex
CREATE INDEX "Payment_createdBy_idx" ON "Payment"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Refund_payment_idx" ON "Refund"("payment");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE INDEX "Refund_requestedBy_idx" ON "Refund"("requestedBy");

-- CreateIndex
CREATE INDEX "Refund_createdBy_idx" ON "Refund"("createdBy");

-- CreateIndex
CREATE INDEX "BillingAttempt_membership_idx" ON "BillingAttempt"("membership");

-- CreateIndex
CREATE INDEX "BillingAttempt_invoice_idx" ON "BillingAttempt"("invoice");

-- CreateIndex
CREATE INDEX "BillingAttempt_status_idx" ON "BillingAttempt"("status");

-- CreateIndex
CREATE INDEX "BillingAttempt_createdBy_idx" ON "BillingAttempt"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAttempt_membership_periodStart_attemptNumber_key" ON "BillingAttempt"("membership", "periodStart", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PayLine_activeKey_key" ON "PayLine"("activeKey");

-- CreateIndex
CREATE INDEX "PayLine_tutor_idx" ON "PayLine"("tutor");

-- CreateIndex
CREATE INDEX "PayLine_session_idx" ON "PayLine"("session");

-- CreateIndex
CREATE INDEX "PayLine_status_idx" ON "PayLine"("status");

-- CreateIndex
CREATE INDEX "PayLine_payrollRun_idx" ON "PayLine"("payrollRun");

-- CreateIndex
CREATE INDEX "PayLine_createdBy_idx" ON "PayLine"("createdBy");

-- CreateIndex
CREATE INDEX "PayLine_tutor_status_idx" ON "PayLine"("tutor", "status");

-- CreateIndex
CREATE INDEX "PayrollRun_location_idx" ON "PayrollRun"("location");

-- CreateIndex
CREATE INDEX "PayrollRun_status_idx" ON "PayrollRun"("status");

-- CreateIndex
CREATE INDEX "PayrollRun_approvedBy_idx" ON "PayrollRun"("approvedBy");

-- CreateIndex
CREATE INDEX "PayrollRun_createdBy_idx" ON "PayrollRun"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProvider_code_key" ON "PaymentProvider"("code");

-- CreateIndex
CREATE INDEX "PaymentProvider_createdBy_idx" ON "PaymentProvider"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_idempotencyKeyHash_key" ON "PaymentSession"("idempotencyKeyHash");

-- CreateIndex
CREATE INDEX "PaymentSession_invoice_idx" ON "PaymentSession"("invoice");

-- CreateIndex
CREATE INDEX "PaymentSession_paymentProvider_idx" ON "PaymentSession"("paymentProvider");

-- CreateIndex
CREATE INDEX "PaymentSession_family_idx" ON "PaymentSession"("family");

-- CreateIndex
CREATE INDEX "PaymentSession_status_idx" ON "PaymentSession"("status");

-- CreateIndex
CREATE INDEX "PaymentSession_providerPaymentId_idx" ON "PaymentSession"("providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentSession_createdBy_idx" ON "PaymentSession"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_replayKey_key" ON "PaymentWebhookEvent"("replayKey");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_createdBy_idx" ON "PaymentWebhookEvent"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "Task_openKey_key" ON "Task"("openKey");

-- CreateIndex
CREATE INDEX "Task_family_idx" ON "Task"("family");

-- CreateIndex
CREATE INDEX "Task_student_idx" ON "Task"("student");

-- CreateIndex
CREATE INDEX "Task_lead_idx" ON "Task"("lead");

-- CreateIndex
CREATE INDEX "Task_location_idx" ON "Task"("location");

-- CreateIndex
CREATE INDEX "Task_owner_idx" ON "Task"("owner");

-- CreateIndex
CREATE INDEX "Task_dueAt_idx" ON "Task"("dueAt");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_completedBy_idx" ON "Task"("completedBy");

-- CreateIndex
CREATE INDEX "Task_createdBy_idx" ON "Task"("createdBy");

-- CreateIndex
CREATE INDEX "Message_family_idx" ON "Message"("family");

-- CreateIndex
CREATE INDEX "Message_sender_idx" ON "Message"("sender");

-- CreateIndex
CREATE INDEX "Message_threadKey_idx" ON "Message"("threadKey");

-- CreateIndex
CREATE INDEX "Message_createdBy_idx" ON "Message"("createdBy");

-- CreateIndex
CREATE INDEX "NotificationLog_createdBy_idx" ON "NotificationLog"("createdBy");

-- CreateIndex
CREATE INDEX "Review_family_idx" ON "Review"("family");

-- CreateIndex
CREATE INDEX "Review_tutor_idx" ON "Review"("tutor");

-- CreateIndex
CREATE INDEX "Review_location_idx" ON "Review"("location");

-- CreateIndex
CREATE INDEX "Review_program_idx" ON "Review"("program");

-- CreateIndex
CREATE INDEX "Review_status_idx" ON "Review"("status");

-- CreateIndex
CREATE INDEX "Review_recordedBy_idx" ON "Review"("recordedBy");

-- CreateIndex
CREATE INDEX "Review_createdBy_idx" ON "Review"("createdBy");

-- CreateIndex
CREATE INDEX "ChangeEvent_actor_idx" ON "ChangeEvent"("actor");

-- CreateIndex
CREATE INDEX "ChangeEvent_createdBy_idx" ON "ChangeEvent"("createdBy");

-- CreateIndex
CREATE INDEX "ChangeEvent_aggregateType_aggregateId_idx" ON "ChangeEvent"("aggregateType", "aggregateId");

-- CreateIndex
CREATE UNIQUE INDEX "CommandReceipt_eventKey_key" ON "CommandReceipt"("eventKey");

-- CreateIndex
CREATE INDEX "CommandReceipt_location_idx" ON "CommandReceipt"("location");

-- CreateIndex
CREATE INDEX "CommandReceipt_createdBy_idx" ON "CommandReceipt"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthApp_clientId_key" ON "OAuthApp"("clientId");

-- CreateIndex
CREATE INDEX "OAuthApp_createdBy_idx" ON "OAuthApp"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_token_key" ON "OAuthToken"("token");

-- CreateIndex
CREATE INDEX "OAuthToken_clientId_idx" ON "OAuthToken"("clientId");

-- CreateIndex
CREATE INDEX "OAuthToken_user_idx" ON "OAuthToken"("user");

-- CreateIndex
CREATE INDEX "OAuthToken_createdBy_idx" ON "OAuthToken"("createdBy");

-- CreateIndex
CREATE INDEX "_Location_programs_B_index" ON "_Location_programs"("B");

-- CreateIndex
CREATE INDEX "_Location_tutors_B_index" ON "_Location_tutors"("B");

-- CreateIndex
CREATE INDEX "_TutorApplication_subjects_B_index" ON "_TutorApplication_subjects"("B");

-- CreateIndex
CREATE INDEX "_Program_subjects_B_index" ON "_Program_subjects"("B");

-- CreateIndex
CREATE INDEX "_Lead_subjects_B_index" ON "_Lead_subjects"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_role_fkey" FOREIGN KEY ("role") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationMembership" ADD CONSTRAINT "LocationMembership_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationMembership" ADD CONSTRAINT "LocationMembership_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationMembership" ADD CONSTRAINT "LocationMembership_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closure" ADD CONSTRAINT "Closure_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closure" ADD CONSTRAINT "Closure_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Level" ADD CONSTRAINT "Level_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_levelsFrom_fkey" FOREIGN KEY ("levelsFrom") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_levelsTo_fkey" FOREIGN KEY ("levelsTo") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_program_fkey" FOREIGN KEY ("program") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_program_fkey" FOREIGN KEY ("program") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_primaryLocation_fkey" FOREIGN KEY ("primaryLocation") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_sourceLead_fkey" FOREIGN KEY ("sourceLead") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Family" ADD CONSTRAINT "Family_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_level_fkey" FOREIGN KEY ("level") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_level_fkey" FOREIGN KEY ("level") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_program_fkey" FOREIGN KEY ("program") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_owner_fkey" FOREIGN KEY ("owner") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_student_fkey" FOREIGN KEY ("student") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tutor" ADD CONSTRAINT "Tutor_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tutor" ADD CONSTRAINT "Tutor_homeLocation_fkey" FOREIGN KEY ("homeLocation") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tutor" ADD CONSTRAINT "Tutor_application_fkey" FOREIGN KEY ("application") REFERENCES "TutorApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tutor" ADD CONSTRAINT "Tutor_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorSubject" ADD CONSTRAINT "TutorSubject_tutor_fkey" FOREIGN KEY ("tutor") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorSubject" ADD CONSTRAINT "TutorSubject_subject_fkey" FOREIGN KEY ("subject") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorSubject" ADD CONSTRAINT "TutorSubject_levelFrom_fkey" FOREIGN KEY ("levelFrom") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorSubject" ADD CONSTRAINT "TutorSubject_levelTo_fkey" FOREIGN KEY ("levelTo") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorSubject" ADD CONSTRAINT "TutorSubject_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorAvailability" ADD CONSTRAINT "TutorAvailability_tutor_fkey" FOREIGN KEY ("tutor") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorAvailability" ADD CONSTRAINT "TutorAvailability_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorAvailability" ADD CONSTRAINT "TutorAvailability_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorTimeOff" ADD CONSTRAINT "TutorTimeOff_tutor_fkey" FOREIGN KEY ("tutor") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorTimeOff" ADD CONSTRAINT "TutorTimeOff_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorCredential" ADD CONSTRAINT "TutorCredential_tutor_fkey" FOREIGN KEY ("tutor") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorCredential" ADD CONSTRAINT "TutorCredential_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorCredential" ADD CONSTRAINT "TutorCredential_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorApplication" ADD CONSTRAINT "TutorApplication_reviewer_fkey" FOREIGN KEY ("reviewer") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorApplication" ADD CONSTRAINT "TutorApplication_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_student_fkey" FOREIGN KEY ("student") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_program_fkey" FOREIGN KEY ("program") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_subject_fkey" FOREIGN KEY ("subject") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_assessor_fkey" FOREIGN KEY ("assessor") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_assessorUser_fkey" FOREIGN KEY ("assessorUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_recommendedPlan_fkey" FOREIGN KEY ("recommendedPlan") REFERENCES "MembershipPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_recommendedPackage_fkey" FOREIGN KEY ("recommendedPackage") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_rescheduledFrom_fkey" FOREIGN KEY ("rescheduledFrom") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_assessment_fkey" FOREIGN KEY ("assessment") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_student_fkey" FOREIGN KEY ("student") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_subject_fkey" FOREIGN KEY ("subject") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_program_fkey" FOREIGN KEY ("program") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_recommendedPlan_fkey" FOREIGN KEY ("recommendedPlan") REFERENCES "MembershipPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_recommendedPackage_fkey" FOREIGN KEY ("recommendedPackage") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_baselineAssessment_fkey" FOREIGN KEY ("baselineAssessment") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_previousVersion_fkey" FOREIGN KEY ("previousVersion") REFERENCES "LearningPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningPlan" ADD CONSTRAINT "LearningPlan_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanGoal" ADD CONSTRAINT "PlanGoal_plan_fkey" FOREIGN KEY ("plan") REFERENCES "LearningPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanGoal" ADD CONSTRAINT "PlanGoal_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_student_fkey" FOREIGN KEY ("student") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_program_fkey" FOREIGN KEY ("program") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_membership_fkey" FOREIGN KEY ("membership") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentPackage_fkey" FOREIGN KEY ("studentPackage") REFERENCES "StudentPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_tutor_fkey" FOREIGN KEY ("tutor") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_plan_fkey" FOREIGN KEY ("plan") REFERENCES "LearningPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_enrollment_fkey" FOREIGN KEY ("enrollment") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_tutor_fkey" FOREIGN KEY ("tutor") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_sentBy_fkey" FOREIGN KEY ("sentBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSeries" ADD CONSTRAINT "SessionSeries_program_fkey" FOREIGN KEY ("program") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSeries" ADD CONSTRAINT "SessionSeries_subject_fkey" FOREIGN KEY ("subject") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSeries" ADD CONSTRAINT "SessionSeries_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSeries" ADD CONSTRAINT "SessionSeries_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSeries" ADD CONSTRAINT "SessionSeries_tutor_fkey" FOREIGN KEY ("tutor") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSeries" ADD CONSTRAINT "SessionSeries_enrollment_fkey" FOREIGN KEY ("enrollment") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSeries" ADD CONSTRAINT "SessionSeries_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_series_fkey" FOREIGN KEY ("series") REFERENCES "SessionSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_program_fkey" FOREIGN KEY ("program") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_subject_fkey" FOREIGN KEY ("subject") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tutor_fkey" FOREIGN KEY ("tutor") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_substituteFor_fkey" FOREIGN KEY ("substituteFor") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_session_fkey" FOREIGN KEY ("session") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_student_fkey" FOREIGN KEY ("student") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_enrollment_fkey" FOREIGN KEY ("enrollment") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_creditGrant_fkey" FOREIGN KEY ("creditGrant") REFERENCES "CreditGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_markedBy_fkey" FOREIGN KEY ("markedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_cancelledBy_fkey" FOREIGN KEY ("cancelledBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_makeUpGrant_fkey" FOREIGN KEY ("makeUpGrant") REFERENCES "CreditGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_payLine_fkey" FOREIGN KEY ("payLine") REFERENCES "PayLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionReport" ADD CONSTRAINT "SessionReport_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionReport" ADD CONSTRAINT "SessionReport_session_fkey" FOREIGN KEY ("session") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionReport" ADD CONSTRAINT "SessionReport_student_fkey" FOREIGN KEY ("student") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionReport" ADD CONSTRAINT "SessionReport_tutor_fkey" FOREIGN KEY ("tutor") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionReport" ADD CONSTRAINT "SessionReport_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_session_fkey" FOREIGN KEY ("session") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_student_fkey" FOREIGN KEY ("student") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_student_fkey" FOREIGN KEY ("student") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_enrollment_fkey" FOREIGN KEY ("enrollment") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_author_fkey" FOREIGN KEY ("author") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_authorTutor_fkey" FOREIGN KEY ("authorTutor") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_student_fkey" FOREIGN KEY ("student") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_plan_fkey" FOREIGN KEY ("plan") REFERENCES "MembershipPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_pendingPlan_fkey" FOREIGN KEY ("pendingPlan") REFERENCES "MembershipPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentPackage" ADD CONSTRAINT "StudentPackage_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentPackage" ADD CONSTRAINT "StudentPackage_student_fkey" FOREIGN KEY ("student") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentPackage" ADD CONSTRAINT "StudentPackage_package_fkey" FOREIGN KEY ("package") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentPackage" ADD CONSTRAINT "StudentPackage_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentPackage" ADD CONSTRAINT "StudentPackage_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_student_fkey" FOREIGN KEY ("student") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_program_fkey" FOREIGN KEY ("program") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_membership_fkey" FOREIGN KEY ("membership") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_studentPackage_fkey" FOREIGN KEY ("studentPackage") REFERENCES "StudentPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_rolledFrom_fkey" FOREIGN KEY ("rolledFrom") REFERENCES "CreditGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_grant_fkey" FOREIGN KEY ("grant") REFERENCES "CreditGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_promoCode_fkey" FOREIGN KEY ("promoCode") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_student_fkey" FOREIGN KEY ("student") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_program_fkey" FOREIGN KEY ("program") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_membership_fkey" FOREIGN KEY ("membership") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_studentPackage_fkey" FOREIGN KEY ("studentPackage") REFERENCES "StudentPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_assessment_fkey" FOREIGN KEY ("assessment") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_issuedBy_fkey" FOREIGN KEY ("issuedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentSession_fkey" FOREIGN KEY ("paymentSession") REFERENCES "PaymentSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAttempt" ADD CONSTRAINT "BillingAttempt_membership_fkey" FOREIGN KEY ("membership") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAttempt" ADD CONSTRAINT "BillingAttempt_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAttempt" ADD CONSTRAINT "BillingAttempt_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLine" ADD CONSTRAINT "PayLine_tutor_fkey" FOREIGN KEY ("tutor") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLine" ADD CONSTRAINT "PayLine_session_fkey" FOREIGN KEY ("session") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLine" ADD CONSTRAINT "PayLine_payrollRun_fkey" FOREIGN KEY ("payrollRun") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLine" ADD CONSTRAINT "PayLine_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProvider" ADD CONSTRAINT "PaymentProvider_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_student_fkey" FOREIGN KEY ("student") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_owner_fkey" FOREIGN KEY ("owner") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sender_fkey" FOREIGN KEY ("sender") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_family_fkey" FOREIGN KEY ("family") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_tutor_fkey" FOREIGN KEY ("tutor") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_program_fkey" FOREIGN KEY ("program") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeEvent" ADD CONSTRAINT "ChangeEvent_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeEvent" ADD CONSTRAINT "ChangeEvent_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandReceipt" ADD CONSTRAINT "CommandReceipt_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandReceipt" ADD CONSTRAINT "CommandReceipt_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthApp" ADD CONSTRAINT "OAuthApp_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Location_programs" ADD CONSTRAINT "_Location_programs_A_fkey" FOREIGN KEY ("A") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Location_programs" ADD CONSTRAINT "_Location_programs_B_fkey" FOREIGN KEY ("B") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Location_tutors" ADD CONSTRAINT "_Location_tutors_A_fkey" FOREIGN KEY ("A") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Location_tutors" ADD CONSTRAINT "_Location_tutors_B_fkey" FOREIGN KEY ("B") REFERENCES "Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TutorApplication_subjects" ADD CONSTRAINT "_TutorApplication_subjects_A_fkey" FOREIGN KEY ("A") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TutorApplication_subjects" ADD CONSTRAINT "_TutorApplication_subjects_B_fkey" FOREIGN KEY ("B") REFERENCES "TutorApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Program_subjects" ADD CONSTRAINT "_Program_subjects_A_fkey" FOREIGN KEY ("A") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Program_subjects" ADD CONSTRAINT "_Program_subjects_B_fkey" FOREIGN KEY ("B") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Lead_subjects" ADD CONSTRAINT "_Lead_subjects_A_fkey" FOREIGN KEY ("A") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Lead_subjects" ADD CONSTRAINT "_Lead_subjects_B_fkey" FOREIGN KEY ("B") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

