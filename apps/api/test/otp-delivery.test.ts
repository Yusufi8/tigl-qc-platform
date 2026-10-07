import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliverAccessCode } from '../src/otp-delivery.mjs';

const originalNodeEnv = process.env.NODE_ENV;
const originalEmailUrl = process.env.OTP_EMAIL_DELIVERY_URL;
const originalSmsUrl = process.env.OTP_SMS_DELIVERY_URL;
const originalToken = process.env.OTP_DELIVERY_TOKEN;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalEmailUrl === undefined) delete process.env.OTP_EMAIL_DELIVERY_URL;
  else process.env.OTP_EMAIL_DELIVERY_URL = originalEmailUrl;
  if (originalSmsUrl === undefined) delete process.env.OTP_SMS_DELIVERY_URL;
  else process.env.OTP_SMS_DELIVERY_URL = originalSmsUrl;
  if (originalToken === undefined) delete process.env.OTP_DELIVERY_TOKEN;
  else process.env.OTP_DELIVERY_TOKEN = originalToken;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OTP delivery configuration', () => {
  it('logs a clearly marked code only in local development when no provider is set', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.OTP_EMAIL_DELIVERY_URL;
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});

    await expect(deliverAccessCode('email', 'employee@example.test', '123456')).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledWith(expect.stringContaining('[DEVELOPMENT OTP - LOCAL ONLY]'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('123456'));
  });

  it('does not expose codes in production when no provider is configured', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.OTP_EMAIL_DELIVERY_URL;
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});

    await expect(deliverAccessCode('email', 'employee@example.test', '123456')).rejects.toMatchObject({
      code: 'OTP_DELIVERY_UNAVAILABLE',
    });
    expect(log).not.toHaveBeenCalled();
  });

  it('sends the documented webhook payload and bearer token', async () => {
    process.env.NODE_ENV = 'production';
    process.env.OTP_EMAIL_DELIVERY_URL = 'https://otp.example.test/send';
    process.env.OTP_DELIVERY_TOKEN = 'test-token';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await deliverAccessCode('email', 'employee@example.test', '654321');

    expect(fetchMock).toHaveBeenCalledWith('https://otp.example.test/send', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({
        channel: 'email',
        to: 'employee@example.test',
        code: '654321',
        purpose: 'tigl-qc-access-request',
        expiresInMinutes: 10,
      }),
    }));
  });
});
