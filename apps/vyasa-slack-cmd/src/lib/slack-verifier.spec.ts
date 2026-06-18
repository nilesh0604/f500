import * as crypto from 'crypto';
import { verifySlackSignature } from './slack-verifier';

const SIGNING_SECRET = 'test_signing_secret_abc123';
const RAW_BODY = 'command=%2Fvyasa&text=Who+was+Karna%3F&user_id=U12345';

function nowSeconds(offsetMs = 0): string {
  return String(Math.floor((Date.now() + offsetMs) / 1000));
}

function makeSignature(
  secret: string,
  timestamp: string,
  body: string
): string {
  const base = `v0:${timestamp}:${body}`;
  return 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
}

// AC: AC-2 — Given a slash command request arrives when Slack signing secret verification is performed
describe('verifySlackSignature', () => {
  it('should_return_true_when_signature_is_valid_and_timestamp_is_recent', () => {
    const timestamp = nowSeconds();
    const signature = makeSignature(SIGNING_SECRET, timestamp, RAW_BODY);

    expect(
      verifySlackSignature(SIGNING_SECRET, RAW_BODY, signature, timestamp)
    ).toBe(true);
  });

  // AC: AC-2 — invalid HMAC
  it('should_return_false_when_signing_secret_is_wrong', () => {
    const timestamp = nowSeconds();
    const signature = makeSignature('wrong_secret', timestamp, RAW_BODY);

    expect(
      verifySlackSignature(SIGNING_SECRET, RAW_BODY, signature, timestamp)
    ).toBe(false);
  });

  // AC: AC-2 — body tampered after signing
  it('should_return_false_when_body_has_been_tampered', () => {
    const timestamp = nowSeconds();
    const signature = makeSignature(SIGNING_SECRET, timestamp, RAW_BODY);

    expect(
      verifySlackSignature(
        SIGNING_SECRET,
        'tampered=true',
        signature,
        timestamp
      )
    ).toBe(false);
  });

  // EDGE-1 — Replay attack: valid sig but timestamp older than 5 minutes
  it('should_return_false_when_timestamp_is_older_than_5_minutes', () => {
    const staleTimestamp = nowSeconds(-(6 * 60 * 1000));
    const signature = makeSignature(SIGNING_SECRET, staleTimestamp, RAW_BODY);

    expect(
      verifySlackSignature(SIGNING_SECRET, RAW_BODY, signature, staleTimestamp)
    ).toBe(false);
  });

  // EDGE-1 — Future timestamp beyond 5 minutes also rejected
  it('should_return_false_when_timestamp_is_more_than_5_minutes_in_future', () => {
    const futureTimestamp = nowSeconds(6 * 60 * 1000);
    const signature = makeSignature(SIGNING_SECRET, futureTimestamp, RAW_BODY);

    expect(
      verifySlackSignature(SIGNING_SECRET, RAW_BODY, signature, futureTimestamp)
    ).toBe(false);
  });

  it('should_return_false_when_timestamp_is_not_a_number', () => {
    expect(
      verifySlackSignature(SIGNING_SECRET, RAW_BODY, 'v0=abc', 'not-a-number')
    ).toBe(false);
  });

  // timingSafeEqual throws when buffers have different byte lengths
  it('should_return_false_when_provided_signature_has_different_length', () => {
    const timestamp = nowSeconds();

    expect(
      verifySlackSignature(SIGNING_SECRET, RAW_BODY, 'v0=short', timestamp)
    ).toBe(false);
  });
});
