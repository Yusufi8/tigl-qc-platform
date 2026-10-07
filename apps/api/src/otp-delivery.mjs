const providerUrl = (channel) => process.env[channel === 'email' ? 'OTP_EMAIL_DELIVERY_URL' : 'OTP_SMS_DELIVERY_URL'];

export async function deliverAccessCode(channel, destination, code) {
  const url = providerUrl(channel);
  if (!url) throw Object.assign(new Error(`OTP ${channel} delivery is not configured`), { code: 'OTP_DELIVERY_UNAVAILABLE' });
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.OTP_DELIVERY_TOKEN ? { authorization: `Bearer ${process.env.OTP_DELIVERY_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      channel,
      to: destination,
      code,
      purpose: 'tigl-qc-access-request',
      expiresInMinutes: 10,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Object.assign(new Error(`OTP ${channel} delivery failed`), { code: 'OTP_DELIVERY_FAILED' });
}
