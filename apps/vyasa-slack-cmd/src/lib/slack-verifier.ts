import * as crypto from 'crypto';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const SLACK_VERSION = 'v0';

/**
 * Verify a Slack slash command request using HMAC-SHA256.
 * Returns true only when both the signature is valid AND the timestamp is within 5 minutes.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifySlackSignature(
  signingSecret: string,
  rawBody: string,
  slackSignature: string,
  slackTimestamp: string
): boolean {
  const timestampMs = parseInt(slackTimestamp, 10) * 1000;
  if (
    isNaN(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > FIVE_MINUTES_MS
  ) {
    return false;
  }

  const baseString = `${SLACK_VERSION}:${slackTimestamp}:${rawBody}`;
  const computed =
    `${SLACK_VERSION}=` +
    crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'utf8'),
      Buffer.from(slackSignature, 'utf8')
    );
  } catch {
    return false;
  }
}
