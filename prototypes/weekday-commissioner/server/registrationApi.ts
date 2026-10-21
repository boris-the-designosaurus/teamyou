import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

type StoredRegistration = {
  id: string
  createdAt: string
  user: { firstName: string; lastName: string; email: string; phone: string; birthdate: string }
  registration: Record<string, unknown>
}

const json = (response: ServerResponse, status: number, body: unknown) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

const readBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > 100_000) throw new Error('Request is too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]!))

const invitationHtml = ({ firstName, team, enrollmentUrl, assetBaseUrl }: { firstName: string; team: string; enrollmentUrl: string; assetBaseUrl: string }) => `<!doctype html>
<html><body style="margin:0;background:#fff;color:#000;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:390px;margin:0 auto">
    <img src="${assetBaseUrl}/assets/email-header.png" width="390" alt="${escapeHtml(team)}" style="display:block;width:100%;max-width:390px;height:auto;border:0" />
    <div style="padding:24px;font-size:16px;line-height:1.5">
      <p style="margin:0 0 24px">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 24px;font-weight:700">You’ve been invited to join the ${escapeHtml(team)} for Fall Kickball 2026!</p>
      <p style="margin:0">Complete your enrollment to secure your spot:</p>
      <p style="margin:0 0 24px">• Pay your registration fee<br>• Sign the player waiver<br>• Confirm your player information</p>
      <p style="margin:0 0 24px"><a href="${escapeHtml(enrollmentUrl)}" style="color:#0177fe;font-size:18px;font-weight:700">Complete enrollment</a></p>
      <p style="margin:0 0 24px">Opening night is Friday, September 25. We’ll send your full schedule once enrollment is complete.</p>
      <p style="margin:0 0 24px">Fall Kickball 2026<br>Fridays · 6:30–9:30 PM<br>Pershing Park · Santa Barbara<br>$85</p>
      <p style="margin:0">See you on the field!<br>Weekday Commissioner</p>
    </div>
  </div>
</body></html>`

export function registrationApi(env: Record<string, string> = process.env as Record<string, string>): Plugin {
  const dataDirectory = path.resolve(process.cwd(), 'data')
  const dataFile = path.join(dataDirectory, 'registrations.json')

  const loadRegistrations = async (): Promise<StoredRegistration[]> => {
    try { return JSON.parse(await readFile(dataFile, 'utf8')) }
    catch (error: any) { if (error?.code === 'ENOENT') return []; throw error }
  }

  const saveRegistrations = async (registrations: StoredRegistration[]) => {
    await mkdir(dataDirectory, { recursive: true })
    await writeFile(dataFile, JSON.stringify(registrations, null, 2))
  }

  return {
    name: 'weekday-registration-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith('/api/')) return next()
        try {
          if (request.method === 'GET' && request.url === '/api/registrations') {
            const registrations = await loadRegistrations()
            return json(response, 200, { registrations: registrations.filter((item) => item.registration.status !== 'assigned').map((item) => ({
              id: item.id,
              createdAt: item.createdAt,
              user: { firstName: item.user.firstName, lastName: item.user.lastName, email: item.user.email },
              registration: item.registration,
            })) })
          }

          if (request.method === 'GET' && request.url.startsWith('/api/enrollment?')) {
            const enrollmentId = new URL(request.url, 'http://localhost').searchParams.get('id')
            const registrations = await loadRegistrations()
            const registration = registrations.find((item) => item.id === enrollmentId)
            if (!registration) return json(response, 404, { error: 'Enrollment invitation not found.' })
            return json(response, 200, {
              enrollment: {
                id: registration.id,
                firstName: registration.user.firstName,
                lastName: registration.user.lastName,
                email: registration.user.email,
                team: String(registration.registration.team || 'Blue Ballerz'),
              },
            })
          }

          if (request.method !== 'POST') return next()

          if (request.url === '/api/registrations') {
            const body = await readBody(request)
            const email = String(body?.user?.email || '').trim().toLowerCase()
            if (!/^\S+@\S+\.\S+$/.test(email)) return json(response, 400, { error: 'A valid email address is required.' })
            if (!body?.user?.firstName || !body?.user?.lastName) return json(response, 400, { error: 'First and last name are required.' })
            if (!body?.user?.phone || !body?.user?.birthdate) return json(response, 400, { error: 'Mobile number and date of birth are required.' })
            if (!body?.registration?.experience || !body?.registration?.rosterCategory || !body?.registration?.position) return json(response, 400, { error: 'Complete all required team-matching fields.' })
            const registrations = await loadRegistrations()
            const existingIndex = registrations.findIndex((item) => item.user.email === email)
            const registration: StoredRegistration = {
              id: existingIndex >= 0 ? registrations[existingIndex].id : randomUUID(),
              createdAt: existingIndex >= 0 ? registrations[existingIndex].createdAt : new Date().toISOString(),
              user: { firstName: String(body.user.firstName), lastName: String(body.user.lastName), email, phone: String(body.user.phone || ''), birthdate: String(body.user.birthdate || '') },
              registration: body.registration || {},
            }
            if (existingIndex >= 0) registrations[existingIndex] = registration
            else registrations.push(registration)
            await saveRegistrations(registrations)
            return json(response, 201, { id: registration.id })
          }

          if (request.url === '/api/assignment-email') {
            const body = await readBody(request)
            const registrations = await loadRegistrations()
            const registration = registrations.find((item) => item.id === body.registrationId || item.user.email === String(body.email || '').toLowerCase())
            if (!registration) return json(response, 404, { error: 'Registration not found.' })
            registration.registration = { ...registration.registration, status: 'assigned', team: String(body.team || 'Blue Ballerz'), assignedAt: new Date().toISOString() }
            await saveRegistrations(registrations)
            const apiKey = env.RESEND_API_KEY
            if (!apiKey) return json(response, 200, { status: 'skipped', reason: 'RESEND_API_KEY is not configured.' })
            const assetBaseUrl = (env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '')
            const team = String(body.team || 'Blue Ballerz')
            const enrollmentUrl = `${assetBaseUrl}/?flow=registration&enrollment=${encodeURIComponent(registration.id)}`
            const delivery = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'weekday-commissioner/0.1' },
              body: JSON.stringify({
                from: env.EMAIL_FROM || 'Weekday Commissioner <onboarding@resend.dev>',
                to: [registration.user.email],
                subject: `You’re invited to join ${team}`,
                html: invitationHtml({ firstName: registration.user.firstName, team, enrollmentUrl, assetBaseUrl }),
              }),
            })
            const result = await delivery.json()
            if (!delivery.ok) return json(response, 502, { error: 'Email delivery failed.', details: result })
            return json(response, 200, { status: 'sent', id: result.id })
          }

          return next()
        } catch (error) {
          return json(response, 500, { error: error instanceof Error ? error.message : 'Unexpected server error.' })
        }
      })
    },
  }
}
