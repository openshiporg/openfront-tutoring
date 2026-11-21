import { User, Role, Business, BusinessSettings, Location, LocationMembership, Room, Closure } from './identity';
import { Subject, Level, Program, MembershipPlan, Package, PromoCode } from './catalogue';
import { Family, Student, Lead, Tutor, TutorSubject, TutorAvailability, TutorTimeOff, TutorCredential, TutorApplication } from './people';
import { Assessment, AssessmentResult, LearningPlan, PlanGoal, Enrollment, Offer, SessionSeries, Session, Booking, SessionReport, WaitlistEntry, ProgressReport } from './learning';
import { Membership, StudentPackage, CreditGrant, CreditEntry, Invoice, InvoiceLine, CreditNote, Payment, Refund, BillingAttempt, PayLine, PayrollRun, PaymentProvider, PaymentSession, PaymentWebhookEvent } from './money';
import { Task, Message, NotificationLog, Review, ChangeEvent, CommandReceipt } from './operations';
import { OAuthApp } from './OAuthApp';
import { OAuthToken } from './OAuthToken';

export const models = {
  // §5.1
  User, Role, Business, BusinessSettings, Location, LocationMembership, Room, Closure,
  // §5.2
  Subject, Level, Program, MembershipPlan, Package, PromoCode,
  // §5.3
  Family, Student, Lead, Tutor, TutorSubject, TutorAvailability, TutorTimeOff, TutorCredential, TutorApplication,
  // §5.4, §5.5
  Assessment, AssessmentResult, LearningPlan, PlanGoal, Enrollment, Offer, SessionSeries, Session, Booking, SessionReport, WaitlistEntry, ProgressReport,
  // §5.6
  Membership, StudentPackage, CreditGrant, CreditEntry, Invoice, InvoiceLine, CreditNote, Payment, Refund, BillingAttempt, PayLine, PayrollRun, PaymentProvider, PaymentSession, PaymentWebhookEvent,
  // §5.7
  Task, Message, NotificationLog, Review, ChangeEvent, CommandReceipt,
  // MCP OAuth (starter)
  OAuthApp, OAuthToken,
};

export default models;
