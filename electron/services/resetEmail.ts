import { loadAccountEnv } from './accountCloud'

/**
 * Sends the reset code with EmailJS.
 * Template must use {{to_email}} as the recipient, plus {{to_name}} and {{reset_code}}.
 */
export async function sendPasswordResetEmail(input: { toEmail: string; toName: string; code: string }): Promise<void> {
  loadAccountEnv()
  const serviceId = (process.env.EMAILJS_SERVICE_ID || '').trim()
  const templateId = (process.env.EMAILJS_TEMPLATE_ID || '').trim()
  const publicKey = (process.env.EMAILJS_PUBLIC_KEY || '').trim()
  const privateKey = (process.env.EMAILJS_PRIVATE_KEY || '').trim()
  if (!serviceId || !templateId || !publicKey) {
    throw new Error('EmailJS is not configured.')
  }

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey || undefined,
      template_params: {
        to_email: input.toEmail,
        email: input.toEmail,
        to_name: input.toName || 'there',
        name: input.toName || 'there',
        reset_code: input.code,
        code: input.code,
      },
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `EmailJS request failed (${res.status})`)
  }
}
