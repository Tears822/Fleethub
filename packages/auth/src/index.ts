export {
  isLikelyCompanyNameDriver,
  isLikelyFleetEntityDriverName,
  fleetEntityNamesMatch,
  normalizeFleetEntityMatchKey,
} from "./driver-fleet-entity";
export { authenticateLogin } from "./authenticate";
export { complete2faLogin } from "./complete-2fa-login";
export { requestPasswordReset, confirmPasswordReset } from "./password-reset";
export {
  verifyEmailWithToken,
  resendEmailVerification,
  sendTenantUserVerificationEmail,
} from "./email-verification";
export { isPublicSignupEnabled, registerPublicTenant } from "./public-tenant-signup";
export {
  beginTotpSetup,
  confirmTotpSetup,
  disableTotp,
  getTotpStatus,
  totpCanBeDisabled,
  type TotpStatus,
} from "./totp-setup";
export {
  inviteTenantUser,
  activateInvitedUser,
  updateTenantUser,
  deleteTenantUser,
  resendTenantUserInvite,
} from "./tenant-users";
export { createTenantDriver, updateTenantDriver } from "./tenant-drivers";
export {
  syncDriverVehicleAssignment,
  ensureInitialVehicleAssignment,
  type VehicleSnapshot,
} from "./driver-vehicle-assignments";
export {
  createTenantCompany,
  updateTenantCompany,
  parseCompanyCreateBody,
  findCompanyDuplicates,
  formatDuplicateError,
  type ParsedCompanyCreate,
  type CompanyDuplicateMatch,
} from "./tenant-companies";
export {
  uploadCompanyLogo,
  resolveLogoFilesystemPath,
  logoPublicUrl,
  getUploadsRoot,
} from "./company-logo";
export {
  listCompanyDocuments,
  listCompanyDocumentsForMaintenance,
  uploadCompanyDocument,
  setCompanyDocumentStatus,
  requestTenantCompanyDocumentRemoval,
  documentPublicUrl,
  documentRetainedFilesystemPath,
  COMPANY_DOCUMENT_CATALOG,
  COMPANY_DOCUMENT_IDS,
  type CompanyDocumentRecord,
  type CompanyDocumentMaintenanceRecord,
  type CompanyDocumentId,
} from "./company-documents";
export {
  listCompanyDocumentsForSuperAdmin,
  readRetainedCompanyDocument,
  purgeCompanyDocumentForSuperAdmin,
} from "./super-admin-company-documents";
export { closeTenantTrips } from "./tenant-shifts";
export { validateTenantTripPayments } from "./validate-trip-payments";
export { updateTenantTripPayments } from "./update-trip-payments";
export {
  buildPaymentUpdateFromMode,
  derivePaymentEditMode,
  hasExplicitPaymentSplit,
  paymentMethodForMode,
  paymentModeNeedsManualReview,
  resolveTripPaymentAmounts,
  resolveTripPaymentDisplayAmounts,
  tripGrossCents,
  tripPaymentDisplayBalanced,
  tripPaymentUnbalanced,
  tripNeedsManualPaymentReview,
  tripNeedsPaymentUiAttention,
  type PaymentEditMode,
  type TripPaymentAmounts,
} from "./trip-payment-amounts";
export {
  readCompanyEconomicDefaults,
  resolveDriverEconomics,
  SYSTEM_ECONOMIC_DEFAULTS,
  type CompanyEconomicDefaults,
} from "./company-economic-defaults";
export { formatFareTypeLabel, isT3Fare, isTipOnlyFare, tripTaximetroCents } from "./shift-liquidation";
export {
  addNetToPaymentBucket,
  addTripToPaymentBuckets,
  classifyPaymentMethod,
  isCollectiblePaymentTrip,
  type PaymentBucket,
} from "./trip-payment-buckets";
export {
  computeDayMetricsFromTripSlices,
  type DriverDayMetricsValues,
  type TripTimeSlice,
} from "./day-metrics";
export {
  classifyUberDriverStatus,
  connectionMetadataIsFresh,
  mergeDriverConnectionMetadata,
  parseDriverConnectionMetadata,
  type DriverConnectionMetadata,
  type DriverConnectionState,
} from "./driver-connection-metadata";
export {
  backfillDriverPlatformDayMetricsFromTrips,
  computeDayMetricsFromTrips,
  formatShiftEurHora,
  formatAppsEurHora,
  resolveEurPerHourFromConnectedMinutes,
  parseShiftHorasConectadoMinutes,
  resolveShiftEurHoraDisplay,
  resolveShiftActivity,
  upsertDriverPlatformDayMetric,
} from "./shift-activity";
export {
  refreshTodayDriverPlatformMetrics,
  refreshTodayMetricsForRecentlyActiveTenants,
} from "./driver-platform-day-metrics";
export type { ShiftActivityDto } from "./shift-activity-types";
export { revertShiftClose, revertTenantShiftClose } from "./revert-shift-close";
export { canReopenClosedShift } from "./rbac";
export {
  listClosedLiquidationPdfGroups,
  type ClosedLiquidationPdfGroup,
} from "./closed-shifts-export";
export {
  listClosedLiquidationEvents,
  listClosedLiquidationEventsForTenant,
  type ClosedLiquidationEvent,
} from "./closed-liquidation-events";
export { previewShiftLiquidation, type LiquidationPreview } from "./preview-shift-liquidation";
export {
  loadShiftLiquidationDocument,
  type ShiftLiquidationDocument,
  type ShiftLiquidationTripLine,
} from "./shift-liquidation-document";
export {
  computeLiquidationSummary,
  resolveTripFeeCents,
  type LiquidationDriverEconomics,
  type LiquidationSummary,
} from "./shift-liquidation";
export {
  listShiftTripsForDetail,
  type ListShiftTripsOptions,
  type ShiftActivityResolveContext,
  type ShiftTripDetailDto,
} from "./tenant-shift-trips";
export {
  createTenantWithAdmin,
  createCompanyForSuperAdmin,
  updateTenantForSuperAdmin,
  deleteTenantForSuperAdmin,
  superAdminTenantToFormSnapshot,
} from "./super-admin-tenants";
export {
  updateCompanyForSuperAdmin,
  deleteCompanyForSuperAdmin,
} from "./super-admin-companies";
export {
  billingPlanFromTenantSettings,
  contactEmailFromCompanyProfile,
  readCompanyProfileForSuperAdminForm,
  TENANT_BILLING_PLANS,
  type TenantBillingPlan,
} from "./super-admin-tenant-form-persist";
export {
  startTenantImpersonation,
  endTenantImpersonation,
  type ImpersonationStart,
  type ImpersonationEnd,
} from "./super-admin-impersonation";
export { createPlatformUser } from "./super-admin-platform-users";
export {
  updatePlatformUserForSuperAdmin,
  updateTenantUserForSuperAdmin,
  deletePlatformUserForSuperAdmin,
  deleteTenantUserForSuperAdmin,
  resetTotpForSuperAdmin,
  resetPasswordForSuperAdmin,
} from "./super-admin-users";
export {
  tenantLoginBlockedMessage,
  commercialStatusLabel,
  type TenantAccessRow,
} from "./tenant-commercial-access";
export {
  getTenantProductivityThresholds,
  updateTenantProductivityThresholds,
  type ProductivityThresholds,
} from "./tenant-settings";
export {
  canViewTenantPlatformIds,
  getTenantGeneralSettings,
  getTenantIntegrationSettings,
  integrationSettingsForSession,
  updateTenantGeneralSettings,
  updateTenantIntegrationSettings,
  type TenantGeneralSettings,
  type TenantIntegrationSettings,
} from "./tenant-general-settings";
export {
  getTenantNotificationSettings,
  updateTenantNotificationSettings,
  type TenantNotificationSettings,
} from "./tenant-notification-settings";
export {
  getTenantAnalyticsSettings,
  listSectorBenchmarkOptInTenantIds,
  parseTenantAnalyticsSettings,
  updateTenantAnalyticsSettings,
  type TenantAnalyticsSettings,
} from "./tenant-analytics-settings";
export type { SectorDriverAverages, SectorPlatformFilter } from "./analytics-sector-types";
export {
  getSectorDriverAveragesForPlatform,
  parseSectorPlatform,
} from "./analytics-sector-benchmarks";
export {
  sendTenantAlertDigest,
  type AlertDigestLine,
  type SendAlertDigestResult,
} from "./notify-tenant-alerts";
export {
  syncStaleThresholdMs,
  syncPlatformLabel,
  isSyncReferenceStale,
  type SyncPlatform,
} from "./sync-stale";
export {
  parseSyncTrigger,
  syncTriggerLabel,
  type PlatformSyncTrigger,
} from "./sync-trigger";
export {
  formatSyncRunIngestDetail,
  ingestSourceFromSyncTrigger,
  ingestSourceLabel,
  parseSyncRunCursorHint,
  parseTripIngestSource,
  syncRunPaymentsComplete,
  syncRunPaymentsPendingMessage,
  type SyncRunCursorHint,
  type TripIngestSource,
} from "./ingest-source";
export {
  findDriverPlatformAccount,
  upsertNormalizedTripsForDriver,
  type TripIngestContext,
  type TripUpsertResult,
} from "./trip-ingest-upsert";
export {
  computeIngestLatencyMs,
  formatIngestLatencyMs,
  getTenantIngestionKpis,
  getTenantIngestionTimeSeries,
  listGlobalIngestionDaily7d,
  listGlobalIngestionHourly24h,
  listGlobalIngestionKpis,
  listGlobalSyncFailuresHourly24h,
  listTenantIngestionDaily7d,
  listTenantIngestionHourly24h,
  listTenantSyncFailuresHourly24h,
  recordIngestionEvent,
  type IngestionKpiSummary,
  type IngestionOutcome,
  type IngestionTimeBucket,
  type SyncFailureTimeBucket,
  type TenantIngestionTimeSeries,
} from "./ingestion-events";
export {
  TENANT_OPERATIONS_TIMEZONE,
  formatDateEsInTenantTz,
  formatDateTimeShortInTenantTz,
  formatDayLabelInTenantTz,
  formatHourLabelInTenantTz,
  tenantBucketStart,
  tenantCalendarDayKey,
  tenantDayDateFromInstant,
  tenantCalendarDateFromInstant,
  tenantDayDateFromKey,
  tenantDayEndFromCalendarDate,
  tenantDayEndFromIso,
  tenantDayStartFromCalendarDate,
  tenantDayStartFromIso,
  tenantTimezoneShortLabel,
  wallTimeInZoneToUtc,
  type TenantBucketGranularity,
} from "./display-timezone";
export {
  getTenantDriverCoverage,
  listTenantSyncHealth,
  type PlatformDriverCoverage,
  type TenantDriverCoverage,
  type TenantSyncHealthRow,
  type TenantRunningSync,
} from "./driver-coverage";
export { getGlobalSyncApiSuccess24h, type SyncApiSuccess24h } from "./sync-api-health";
export {
  autoPollAlertThresholdMinutes,
  autoPollHealthWhere,
  autoPollSuccessWhere,
  getGlobalAutoPollHealth,
  type AutoPollPlatformHealth,
  type GlobalAutoPollHealth,
} from "./auto-poll-health";
export {
  heartbeatAtFromCursorHint,
  isSyncRunStale,
  syncRunLastActivity,
  SYNC_RUN_RUNNING_STALE_MS,
} from "./sync-run-staleness";
export {
  failRunningSyncRunsForStalledJob,
  getSuperAdminSyncAlertSummary,
  reconcileStaleSyncRuns,
  type ReconcileStaleSyncRunsResult,
  type StaleSyncRunRow,
  type SuperAdminSyncAlertSummary,
} from "./super-admin-sync-recovery";
export {
  buildOperationalAlertsForTenant,
  buildSyncStaleAlertsForTenant,
  countPendingPaymentAlerts,
  type BuildOperationalAlertsOptions,
} from "./operational-alerts";
export {
  mapOperationalAlertsToDashboard,
  type DashboardStyleAlert,
} from "./operational-alerts-dashboard";
export {
  checkAndSendOperationalDigest,
  checkAndSendSyncStaleAlerts,
  runOperationalDigestsForAllTenants,
  runSyncStaleAlertsForAllTenants,
} from "./notify-operational-digest";
export { isSmtpConfigured, sendEmail, appPublicUrl } from "./email";
export {
  estimateAcceptanceRate,
  acceptanceFromOffers,
  productivityLevelFromMetrics,
  tripDurationMs,
  type ProductivityLevel,
} from "./driver-productivity";
export {
  APPS_PRODUCTIVITY_STATUS_LABEL,
  appsProductivityStatus,
  classifyAppsProductivity,
  computeFleetDayAveragesFromMetrics,
  type AppsProductivityLabel,
  type AppsProductivityMetrics,
  type AppsProductivityStatus,
  type FleetDayAverages,
} from "./apps-productivity";
export {
  AUDIT_LOG_EXPORT_MAX,
  AUDIT_LOG_UI_LIST_MAX,
  listTenantAuditLogs,
  type TenantAuditLogRow,
} from "./tenant-audit-logs";
export { updateAccountProfile, changeAccountPassword, getAccountProfile, accountDisplayName } from "./account-profile";
export type { AccountProfile } from "./account-profile";
export {
  ALLOWED_USER_LOCALES,
  getLocaleForSession,
  parseUserLocaleInput,
  updateAccountLocale,
} from "./user-locale";
export {
  FH_GUEST_LOCALE_COOKIE,
  GUEST_LOCALE_MAX_AGE_SECONDS,
  buildGuestLocaleSetCookieHeader,
  guestLocaleCookieEnv,
  localeFromAcceptLanguage,
  parseGuestLocaleFromCookie,
} from "./guest-locale-cookie";
export { loginRequestSchema } from "./login.schema";
export type { LoginRequest } from "./login.schema";
export { signSessionToken, verifySessionToken } from "./session-jwt";
export { readOptionalAuthSecretBytes, getAuthSecretBytes } from "./secret";
export { FH_SESSION_COOKIE, FH_PLATFORM_SESSION_COOKIE } from "./constants";
export { SESSION_MAX_AGE_SECONDS } from "./session-duration";
export {
  resolveCompanyScopeForSession,
  companyWhere,
  driverWhere,
  type CompanyScope,
} from "./tenant-scope";
export {
  FH_COMPANY_SCOPE_COOKIE,
  COMPANY_SCOPE_ALL,
  formatCompanyScopeCookie,
  parseCompanyScopeCookieSelection,
  resolveCompanyScopeWithCookie,
  companyScopeLabelForSession,
  driverIdMatchesScope,
} from "./company-scope-cookie";
export {
  parseTenantRole,
  canManageTenantSettings,
  canManageCompanies,
  canManageDrivers,
  canManageShifts,
  isReadOnly,
  canExportTenantData,
  getTenantRouteRestriction,
  redirectPathForRestriction,
  isTenantRouteAllowed,
  isTenantUsersAdminApiPath,
  isTenantCompaniesAdminApiPath,
  isTenantSettingsAdminApiPath,
  isTenantNotificationsAdminApiPath,
  isTenantShiftLiquidationExportPostPath,
  type TenantRouteRestriction,
  type TenantRoleLike,
} from "./rbac";
export type {
  AppSession,
  AuthFailureReason,
  LoginSuccess,
  LoginRequires2fa,
  LoginResponse,
} from "./types";
export { isLoginRequires2fa } from "./types";
export {
  PLATFORM_LOGIN_SLUG,
  isPlatformSession,
  isTenantSession,
  isImpersonatingSession,
  defaultRedirectForSession,
} from "./session-kind";
