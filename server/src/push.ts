import webpush from 'web-push';
import type { Config } from './config';
import { log, registerSecret } from './util/log';

export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** What a notification says. Never contains cards. */
export interface PushMessage {
  title: string;
  body: string;
  /** Same tag replaces the previous notification for this game. */
  tag: string;
  /** Where a tap on the notification goes. */
  url: string;
}

export interface PushSender {
  publicKey: string;
  /** Resolves `gone: true` when the subscription no longer exists (remove it). */
  send(sub: PushSubscriptionData, msg: PushMessage): Promise<{ gone: boolean }>;
}

/**
 * Real web push with VAPID. Development without keys gets throwaway keys (subscriptions
 * stop working after a restart); production without keys has push turned off.
 */
export function createPushSender(config: Config): PushSender | null {
  let publicKey = config.VAPID_PUBLIC_KEY;
  let privateKey = config.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    if (config.NODE_ENV === 'production') {
      log.warn('VAPID keys are not set: "your turn" notifications are off.');
      return null;
    }
    ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
  }
  registerSecret(privateKey);
  const subject = config.VAPID_SUBJECT ?? 'mailto:noreply@teen-patti-club.invalid';
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (e) {
    log.error('Invalid VAPID settings; notifications are off.', e);
    return null;
  }
  return {
    publicKey,
    async send(sub, msg) {
      try {
        await webpush.sendNotification(sub, JSON.stringify(msg), { TTL: 120, urgency: 'high' });
        return { gone: false };
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return { gone: true };
        log.warn(`push failed (${status ?? 'network'})`);
        return { gone: false };
      }
    },
  };
}
