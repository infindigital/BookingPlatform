export {
  type NotificationMessage,
  type SendResult,
  type ChannelProvider,
  NoopProvider,
  registerChannelProvider,
  resetChannelProviders,
  getChannelProvider,
} from './provider';
export {
  SmtpEmailProvider,
  emailProviderFromEnv,
  emailConfigFromEnv,
  emailConfigStatus,
  type EmailIdentity,
  type EmailConfigStatus,
} from './smtp-provider';
export { sendSmtpMail, buildMimeMessage, type SmtpConfig, type SmtpMail, type SmtpSendResult } from './smtp-client';
export { registerProvidersFromEnv } from './register';
export { sendTestEmail } from './test-email';
export {
  enqueueBookingEvent,
  scheduleBookingReminder,
  cancelBookingReminders,
  handleBookingEvent,
} from './enqueue';
export { processDueNotifications, type ProcessResult } from './dispatch';
export {
  getNotificationTemplates,
  saveNotificationTemplate,
  resetNotificationTemplate,
  type NotificationTemplateConfig,
} from './templates';
export {
  getNotificationActivity,
  type NotificationActivity,
  type NotificationActivityRow,
} from './activity';
export { buildBookingContext, type BookingNotificationContext } from './variables';
