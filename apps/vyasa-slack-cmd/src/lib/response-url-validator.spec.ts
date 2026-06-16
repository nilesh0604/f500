import { validateResponseUrl } from './response-url-validator';

// AC: AC-2 (SSRF guard on response_url), ERR-PATH — invalid response_url
describe('validateResponseUrl', () => {
  it('should_not_throw_when_url_is_valid_https_hooks_slack_com', () => {
    expect(() =>
      validateResponseUrl('https://hooks.slack.com/commands/T123/456/xyzabc')
    ).not.toThrow();
  });

  it('should_throw_when_url_uses_http_instead_of_https', () => {
    expect(() =>
      validateResponseUrl('http://hooks.slack.com/commands/T123/456/abc')
    ).toThrow('must originate from https://hooks.slack.com');
  });

  it('should_throw_when_host_is_not_hooks_slack_com', () => {
    expect(() =>
      validateResponseUrl('https://attacker.com/steal-data')
    ).toThrow('must originate from https://hooks.slack.com');
  });

  it('should_throw_when_url_is_malformed_and_not_parseable', () => {
    expect(() => validateResponseUrl('not-a-url')).toThrow('not a valid URL');
  });

  // SSRF guard: subdomain spoofing attempt
  it('should_throw_when_url_uses_ssrf_subdomain_spoofing', () => {
    expect(() =>
      validateResponseUrl('https://hooks.slack.com.evil.com/commands')
    ).toThrow('must originate from https://hooks.slack.com');
  });
});
