/**
 * k6 load test stub — POST / (vyasa-slack-cmd receiver) — SCRUM-21
 *
 * TDD SLA (AC #1): End-to-end answer delivered within 30 seconds.
 * Receiver Lambda must ack within Slack's 3-second deadline.
 *
 * TODO: Before running:
 *   1. Set BASE_URL to the Lambda Function URL for the receiver.
 *   2. Set SLACK_SIGNING_SECRET and generate a valid X-Slack-Signature for the test body.
 *   3. Tune vus/duration based on expected workspace concurrency.
 *   4. Run: k6 run --env BASE_URL=<url> --env SLACK_SIGNING_SECRET=<secret> scripts/load-tests/k6/SCRUM-21-slash-command.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

// TODO: Tune vus/duration based on expected concurrent Slack users
export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    // Receiver must ack to Slack within 3 seconds (Slack deadline)
    http_req_duration: ['p(99)<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

const ackDuration = new Trend('ack_duration_ms');

export default function () {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = `command=%2Fvyasa&text=Who+was+Karna%3F&response_url=https%3A%2F%2Fhooks.slack.com%2Ftest&user_id=U123&channel_id=C123&team_id=T123&trigger_id=t123`;

  // TODO: Compute a real HMAC-SHA256 signature using SLACK_SIGNING_SECRET and body
  // const sig = computeSlackSig(__ENV.SLACK_SIGNING_SECRET, timestamp, body);
  const sig = 'v0=TODO_REPLACE_WITH_VALID_HMAC';

  const res = http.post(`${__ENV.BASE_URL}/`, body, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Slack-Signature': sig,
      'X-Slack-Request-Timestamp': String(timestamp),
    },
  });

  ackDuration.add(res.timings.duration);

  check(res, {
    'receiver acks 200': r => r.status === 200,
    'ack contains Asking Vyasa': r => (r.body ?? '').includes('Asking Vyasa'),
    'ack within 3s Slack deadline': r => r.timings.duration < 3000,
  });

  sleep(1);
}
