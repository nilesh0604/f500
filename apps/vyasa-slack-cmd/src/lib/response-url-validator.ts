const ALLOWED_SLACK_HOST = 'hooks.slack.com';

/**
 * Validate that a response_url is a legitimate Slack webhook URL.
 * Guards against SSRF attacks via a user-controlled response_url field.
 * @throws Error when the URL is not https://hooks.slack.com
 */
export function validateResponseUrl(responseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(responseUrl);
  } catch {
    throw new Error(`Invalid response_url: not a valid URL`);
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== ALLOWED_SLACK_HOST) {
    throw new Error(
      `Invalid response_url: must originate from https://${ALLOWED_SLACK_HOST}`
    );
  }
}
