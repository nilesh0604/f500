/**
 * Slack slash command types for Vyasa Slack integration
 */

/**
 * URL-decoded payload Slack sends via x-www-form-urlencoded POST
 */
export interface SlackSlashCommandPayload {
  /** The slash command string, e.g. "/vyasa" */
  command: string;
  /** Raw user-supplied text after the command */
  text: string;
  /** Webhook URL for asynchronous responses */
  response_url: string;
  /** Slack user ID of the invoker */
  user_id: string;
  /** Slack channel ID where the command was run */
  channel_id: string;
  /** Slack team/workspace ID */
  team_id: string;
  /** Short-lived trigger ID for opening modals */
  trigger_id: string;
}

/**
 * Payload passed from receiver Lambda to worker Lambda via direct invocation
 */
export interface SlackWorkerPayload {
  /** Trimmed question text from the user */
  question: string;
  /** Slack response_url for posting the async answer */
  response_url: string;
  /** Correlation ID propagated from the receiver for log tracing */
  correlation_id: string;
}

/**
 * JSON body sent to Slack (immediate ack or via response_url callback)
 */
export interface SlackMessageResponse {
  /** "in_channel" to show everyone, "ephemeral" to show only to the user */
  response_type: 'in_channel' | 'ephemeral';
  /** Message text (supports Slack mrkdwn) */
  text: string;
  /** When true, replaces the original acknowledgement message */
  replace_original?: boolean;
}
