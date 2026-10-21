import { FormEvent, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, Check, RotateCcw, UserPlus, X } from 'lucide-react'
import { createRoot } from 'react-dom/client'
import './styles.css'

type Step = 'season' | 'account' | 'profile' | 'role' | 'details' | 'status' | 'commissioner'
type RegistrationStatus = 'new' | 'assigned' | 'declined'
type EnrollmentStep = 'welcome' | 'shirt' | 'emergency' | 'waiver' | 'payment' | 'complete'
type EnrollmentInvite = { id: string; firstName: string; lastName: string; email: string; team: string }

type DemoState = {
  step: Step
  registered: boolean
  registrationId?: string
  user: {
    firstName: string
    lastName: string
    email: string
    password: string
    phone: string
    birthdate: string
  }
  registration: {
    role: 'free_agent'
    status: RegistrationStatus
    experience: string
    rosterCategory: string
    position: string
    availability: string[]
    preferredTeammates: string
    notes: string
  }
}

const STORAGE_KEY = 'weekday-commissioner-demo-v1'
const initialState: DemoState = {
  step: 'season',
  registered: false,
  user: { firstName: 'Patty', lastName: 'Monroe', email: '', password: '', phone: '', birthdate: '' },
  registration: {
    role: 'free_agent',
    status: 'new',
    experience: '',
    rosterCategory: '',
    position: '',
    availability: ['Friday'],
    preferredTeammates: '',
    notes: '',
  },
}

const flow: Step[] = ['season', 'account', 'profile', 'role', 'details', 'status']

function App() {
  const enrollmentId = new URLSearchParams(window.location.search).get('enrollment')
  const [enrollmentStep, setEnrollmentStep] = useState<EnrollmentStep>('welcome')
  const [enrollment, setEnrollment] = useState<EnrollmentInvite | null>(null)
  const [enrollmentError, setEnrollmentError] = useState('')
  const [state, setState] = useState<DemoState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    const restored = saved ? JSON.parse(saved) : initialState
    const requestedFlow = new URLSearchParams(window.location.search).get('flow')
    if (requestedFlow === 'registration') return { ...restored, step: 'season' }
    if (requestedFlow === 'commissioner-assignment') return { ...restored, step: 'commissioner' }
    return restored
  })
  const [showConfirmation, setShowConfirmation] = useState(false)

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state])
  useEffect(() => {
    if (!enrollmentId) return
    fetch(`/api/enrollment?id=${encodeURIComponent(enrollmentId)}`)
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to load enrollment.')
        setEnrollment(result.enrollment)
      })
      .catch((error) => setEnrollmentError(error instanceof Error ? error.message : 'Unable to load enrollment.'))
  }, [enrollmentId])

  const patchUser = (patch: Partial<DemoState['user']>) =>
    setState((current) => ({ ...current, user: { ...current.user, ...patch } }))
  const patchRegistration = (patch: Partial<DemoState['registration']>) =>
    setState((current) => ({ ...current, registration: { ...current.registration, ...patch } }))
  const go = (step: Step) => setState((current) => ({ ...current, step }))
  const back = () => {
    const index = flow.indexOf(state.step)
    if (index > 0) go(flow[index - 1])
  }
  const reset = () => {
    localStorage.removeItem(STORAGE_KEY)
    setShowConfirmation(false)
    setState(initialState)
  }
  const submitRegistration = async () => {
    const response = await fetch('/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: state.user, registration: state.registration }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Unable to complete registration.')
    setState((current) => ({ ...current, registered: true, registrationId: result.id, step: 'status' }))
  }

  return (
    <div className="site-shell">
      <div className="device" aria-live="polite">
        {enrollmentId && !enrollment && <main className="screen enrollment-loading"><p>{enrollmentError || 'Loading enrollment…'}</p></main>}
        {enrollment && <EnrollmentFlow invite={enrollment} step={enrollmentStep} setStep={setEnrollmentStep} />}
        {!enrollmentId && <>
        {state.step === 'season' && <SeasonScreen onRegister={() => go('account')} />}
        {state.step === 'account' && <AccountScreen state={state} patchUser={patchUser} onContinue={() => go('profile')} onBack={back} />}
        {state.step === 'profile' && <ProfileScreen state={state} patchUser={patchUser} onContinue={() => go('role')} onBack={back} />}
        {state.step === 'role' && <RoleScreen onContinue={() => go('details')} onBack={back} />}
        {state.step === 'details' && <DetailsScreen state={state} patchRegistration={patchRegistration} onComplete={submitRegistration} onBack={back} />}
        {state.step === 'status' && <StatusScreen state={state} onBack={back} onCommissioner={() => go('commissioner')} />}
        {state.step === 'commissioner' && <CommissionerScreen state={state} onBack={() => go('status')} />}
        {showConfirmation && <Confirmation onClose={() => setShowConfirmation(false)} />}
        </>}
      </div>
      <button className="reset-button" onClick={reset}><RotateCcw size={14} /> Reset demo</button>
    </div>
  )
}

function EnrollmentFlow({ invite, step, setStep }: { invite: EnrollmentInvite; step: EnrollmentStep; setStep: (step: EnrollmentStep) => void }) {
  const order: EnrollmentStep[] = ['welcome', 'shirt', 'emergency', 'waiver', 'payment', 'complete']
  const back = () => setStep(order[Math.max(0, order.indexOf(step) - 1)])
  if (step === 'welcome') return <EnrollmentWelcome invite={invite} onContinue={() => setStep('shirt')} />
  if (step === 'shirt') return <EnrollmentShirt onBack={back} onContinue={() => setStep('emergency')} />
  if (step === 'emergency') return <EnrollmentEmergency onBack={back} onContinue={() => setStep('waiver')} />
  if (step === 'waiver') return <EnrollmentWaiver invite={invite} onBack={back} onContinue={() => setStep('payment')} />
  if (step === 'payment') return <EnrollmentPayment onBack={back} onContinue={() => setStep('complete')} />
  return <EnrollmentComplete invite={invite} onBack={back} />
}

function EnrollmentHeader({ onBack }: { onBack?: () => void }) {
  return <div className="enrollment-header">
    <div className="enrollment-blue"><img src="/assets/team-invite-burst.svg" alt="" />{onBack && <button onClick={onBack}><ArrowLeft size={24} /> Back</button>}</div>
    <div className="enrollment-team-mark"><img src="/assets/team-invite-ballers.png" alt="Blue Ballerz" /></div>
  </div>
}

function EnrollmentButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button className="enrollment-cta" onClick={onClick} disabled={disabled}><span>{children}</span><ChevronRight size={24} /></button>
}

function EnrollmentWelcome({ invite, onContinue }: { invite: EnrollmentInvite; onContinue: () => void }) {
  return <main className="screen enrollment-screen"><EnrollmentHeader />
    <section className="enrollment-title"><h1>Hey {invite.firstName}</h1><p>Secure your spot with the {invite.team}</p></section>
    <section className="enrollment-content"><div className="enrollment-card season-summary"><div><h2>Fall Kickball 2026</h2><strong>$85</strong></div><p>Fridays · 6:30–9:30 PM</p><p>Pershing Park · Santa Barbara</p><p>Enrollment deadline: 9/28/26</p></div><EnrollmentButton onClick={onContinue}>Continue</EnrollmentButton></section>
  </main>
}

function EnrollmentShirt({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const [size, setSize] = useState('')
  const [custom, setCustom] = useState('')
  return <main className="screen enrollment-screen"><EnrollmentHeader onBack={onBack} /><section className="enrollment-title"><h1>Shirt info</h1></section><section className="enrollment-form">
    <Field label="Shirt size"><select value={size} onChange={(e) => setSize(e.target.value)}><option value="">Select..</option><option>Small</option><option>Medium</option><option>Large</option><option>XL</option><option>2XL</option></select></Field>
    <Field label="Customize your shirt · +$9"><input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add name and number" /></Field>
    <EnrollmentButton onClick={onContinue} disabled={!size}>Continue</EnrollmentButton>
  </section></main>
}

function EnrollmentEmergency({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  const [contact, setContact] = useState({ name: '', relationship: '', phone: '' })
  return <main className="screen enrollment-screen"><EnrollmentHeader onBack={onBack} /><section className="enrollment-title"><h1>Emergency contact</h1></section><section className="enrollment-form">
    <Field label="Emergency contact name"><input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="Enter" /></Field>
    <Field label="Relationship"><input value={contact.relationship} onChange={(e) => setContact({ ...contact, relationship: e.target.value })} placeholder="Enter" /></Field>
    <Field label="Emergency contact mobile"><input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="Enter" /></Field>
    <button className="add-contact" type="button">＋ Add another contact <small>Optional</small></button>
    <EnrollmentButton onClick={onContinue} disabled={!contact.name || !contact.relationship || !contact.phone}>Continue</EnrollmentButton>
  </section></main>
}

function EnrollmentWaiver({ invite, onBack, onContinue }: { invite: EnrollmentInvite; onBack: () => void; onContinue: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [signed, setSigned] = useState(false)
  const drawing = useRef(false)
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width), y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height) } }
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); const p = point(event); const context = event.currentTarget.getContext('2d'); context?.beginPath(); context?.moveTo(p.x, p.y) }
  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const p = point(event); const context = event.currentTarget.getContext('2d'); if (!context) return; context.strokeStyle = '#111827'; context.lineWidth = 3; context.lineCap = 'round'; context.lineJoin = 'round'; context.lineTo(p.x, p.y); context.stroke(); setSigned(true) }
  const stop = () => { drawing.current = false }
  const clear = () => { const canvas = canvasRef.current; canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); setSigned(false) }
  const generate = () => { const canvas = canvasRef.current; const context = canvas?.getContext('2d'); if (!canvas || !context) return; context.clearRect(0, 0, canvas.width, canvas.height); context.font = 'italic 32px cursive'; context.fillStyle = '#111827'; context.fillText(`${invite.firstName} ${invite.lastName}`, 18, 54); setSigned(true) }
  return <main className="screen enrollment-screen waiver-screen"><EnrollmentHeader onBack={onBack} /><section className="enrollment-title"><h1>Waiver</h1><p>Review and sign your waiver</p></section><section className="enrollment-form">
    <label className="waiver-label">Athletic waiver</label><div className="waiver-box"><div className="waiver-copy"><strong>Adult Waiver/Release<br />AMATEUR ATHLETIC WAIVER AND RELEASE OF LIABILITY</strong><br /><strong>READ BEFORE AGREEING</strong><p>In consideration of being allowed to participate in any way in Double Play Socials LLC athletic sports program, related events and activities, I acknowledge and freely assume all risks, known and unknown, and accept full responsibility for my participation.</p></div><div className="signature-pad"><canvas ref={canvasRef} width="620" height="120" onPointerDown={start} onPointerMove={draw} onPointerUp={stop} onPointerCancel={stop} aria-label="Draw your signature" /><button onClick={clear} aria-label="Clear signature"><RotateCcw size={16} /></button><button onClick={generate}>Generate Signature</button></div></div>
    <div className="signed-by">Signed By: {signed ? `${invite.firstName} ${invite.lastName}` : ''}<br />Date: {signed ? new Date().toLocaleDateString() : ''}</div>
    <EnrollmentButton onClick={onContinue} disabled={!signed}>Accept &amp; sign</EnrollmentButton><p className="waiver-note">By selecting Accept &amp; sign, you agree to the waiver above</p>
  </section></main>
}

function EnrollmentPayment({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  return <main className="screen enrollment-screen"><EnrollmentHeader onBack={onBack} /><section className="enrollment-title"><h1>Payment</h1><p>Registration $85<br />Shirt customization $9<br /><strong>Total $94</strong></p></section><section className="payment-options"><button onClick={onContinue}>Buy with <strong>G Pay</strong></button><button onClick={onContinue}>Pay with <strong> Pay</strong></button><div className="payment-divider"><span>or pay by credit card</span></div><button onClick={onContinue}>Pay with credit card</button></section></main>
}

function EnrollmentComplete({ invite, onBack }: { invite: EnrollmentInvite; onBack: () => void }) {
  return <main className="screen enrollment-screen"><EnrollmentHeader onBack={onBack} /><section className="enrollment-title complete-title"><h1>You're on {invite.team}</h1></section><section className="enrollment-content"><div className="enrollment-card complete-card"><h2>First game</h2><p>Friday, September 25</p><p>7:30 PM</p><p>Pershing Park</p><h2>Fall Kickball 2026</h2><p>Fridays · 6:30–9:30 PM</p></div><button className="enrollment-cta" onClick={() => { window.location.href = '/?flow=registration' }}><span>View team</span></button></section></main>
}

function BrandHeader({ compact = false }: { compact?: boolean }) {
  if (compact) return null
  return (
    <header className="brand-header">
      <img className="burst" src="/assets/header-burst.svg" alt="" />
      <div className="wc-mark" role="img" aria-label="Weekday Commissioner">
        <img src="/assets/wc-mark.svg" alt="" />
        <span>WC</span>
      </div>
    </header>
  )
}

function SeasonTitle() {
  return <div className="season-title"><h1>Fall Kickball 2026</h1><p>Cabrillo Field · Fridays</p></div>
}

function BackButton({ onClick }: { onClick: () => void }) {
  return <button className="back-button" onClick={onClick}><ArrowLeft size={20} /> Back</button>
}

function PrimaryButton({ children, onClick, type = 'button' }: { children: React.ReactNode; onClick?: () => void; type?: 'button' | 'submit' }) {
  return <button className="primary-button" type={type} onClick={onClick}><span>{children}</span><ChevronRight size={22} /></button>
}

function SeasonScreen({ onRegister }: { onRegister: () => void }) {
  return <main className="screen season-screen">
    <BrandHeader />
    <section className="season-hero">
      <span className="eyebrow">Registration open</span>
      <h1>Fall Kickball 2026</h1>
      <p className="hero-copy">Friday nights, friendly competition, and a team waiting for you.</p>
      <div className="season-card">
        <div><span>When</span><strong>Fridays · 6:30–9:30 PM</strong></div>
        <div><span>Where</span><strong>Pershing Park · Santa Barbara</strong></div>
        <div className="fee-row"><span>Registration</span><strong>$85</strong></div>
      </div>
      <PrimaryButton onClick={onRegister}>Register</PrimaryButton>
      <p className="fine-print">Already registered? Sign in</p>
    </section>
  </main>
}

function AccountScreen({ state, patchUser, onContinue, onBack }: ScreenProps) {
  const submit = (event: FormEvent) => { event.preventDefault(); onContinue() }
  return <main className="screen registration-screen account-screen">
    <BackButton onClick={onBack} /><BrandHeader /><SeasonTitle />
    <form className="form-panel account-panel" onSubmit={submit}>
      <h2>Create your account</h2>
      <button className="google-button" type="button"><img src="/assets/google.svg" alt="" />Continue with Google</button>
      <div className="divider"><span>or continue with email</span></div>
      <Field label="Email address"><input required type="email" value={state.user.email} onChange={(e) => patchUser({ email: e.target.value })} placeholder="name@email.com" /></Field>
      <PrimaryButton type="submit">Continue</PrimaryButton>
    </form>
  </main>
}

type ScreenProps = { state: DemoState; patchUser: (patch: Partial<DemoState['user']>) => void; onContinue: () => void; onBack: () => void }

function ProfileScreen({ state, patchUser, onContinue, onBack }: ScreenProps) {
  const submit = (event: FormEvent) => { event.preventDefault(); onContinue() }
  return <main className="screen registration-screen profile-screen">
    <BackButton onClick={onBack} /><BrandHeader /><SeasonTitle />
    <form className="form-panel profile-panel" onSubmit={submit}>
      <h2>Complete your profile</h2>
      <Field label="First name"><input required value={state.user.firstName} onChange={(e) => patchUser({ firstName: e.target.value })} /></Field>
      <Field label="Last name"><input required value={state.user.lastName} onChange={(e) => patchUser({ lastName: e.target.value })} /></Field>
      <PhoneField value={state.user.phone} onChange={(phone) => patchUser({ phone })} />
      <Field label="Date of birth"><input className="profile-date-field" required inputMode="numeric" value={state.user.birthdate} onChange={(e) => patchUser({ birthdate: e.target.value })} placeholder="MM  /  DD  /  YYYY" /></Field>
      <PrimaryButton type="submit">Continue</PrimaryButton>
    </form>
  </main>
}

function RoleScreen({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) {
  return <main className="screen registration-screen role-screen">
    <BackButton onClick={onBack} /><BrandHeader /><SeasonTitle />
    <section className="form-panel role-panel">
      <h2>How are you joining?</h2>
      <div className="role-options">
        <button className="role-card" type="button" onClick={onContinue}><strong>Join as a free agent</strong><span>We’ll match you with a team.</span></button>
        <button className="role-card" type="button" onClick={onContinue}><strong>Create and coach a team</strong><span>Requires commissioner approval.</span></button>
      </div>
    </section>
  </main>
}

function DetailsScreen({ state, patchRegistration, onComplete, onBack }: { state: DemoState; patchRegistration: (patch: Partial<DemoState['registration']>) => void; onComplete: () => Promise<void>; onBack: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    try { await onComplete() }
    catch (error) { setSubmitError(error instanceof Error ? error.message : 'Unable to complete registration.') }
    finally { setSubmitting(false) }
  }
  return <main className="screen registration-screen details-screen">
    <BackButton onClick={onBack} /><BrandHeader /><SeasonTitle />
    <form className="form-panel details-panel" onSubmit={submit}>
      <h2>Help us find your team</h2>
      <SelectField label="Experience level" required value={state.registration.experience} onChange={(value) => patchRegistration({ experience: value })} options={['New to kickball', 'Played before', 'Experienced']} />
      <SelectField label="Roster category/gender" required value={state.registration.rosterCategory} onChange={(value) => patchRegistration({ rosterCategory: value })} options={['Female roster category', 'Male roster category', 'Open roster category']} />
      <SelectField label="Position preference" required value={state.registration.position} onChange={(value) => patchRegistration({ position: value })} options={['No preference', 'Pitcher', 'Catcher', 'Infield', 'Outfield']} />
      <Field label="Want to play with someone?"><input type="email" value={state.registration.preferredTeammates} onChange={(e) => patchRegistration({ preferredTeammates: e.target.value })} placeholder="name@email.com" /></Field>
      <Field label="Anything else we should know?"><textarea value={state.registration.notes} onChange={(e) => patchRegistration({ notes: e.target.value })} placeholder="Enter" /></Field>
      {submitError && <p className="form-error" role="alert">{submitError}</p>}
      <button className="primary-button" type="submit" disabled={submitting}><span>{submitting ? 'Submitting…' : 'Continue'}</span><ChevronRight size={22} /></button>
    </form>
  </main>
}

function StatusScreen({ state, onBack, onCommissioner }: { state: DemoState; onBack: () => void; onCommissioner: () => void }) {
  const [showNotice, setShowNotice] = useState(true)
  const experience = formatExperience(state.registration.experience) === 'First season' ? 'Intermediate' : formatExperience(state.registration.experience)
  const roster = state.registration.rosterCategory || 'Coed'
  const teammate = state.registration.preferredTeammates || 'Sarah@email.com'

  return <main className="screen status-screen">
    <header className="status-header">
      <div className="status-topbar"><strong>Fall Kickball 2026</strong><img src="/assets/status-avatar.png" alt="Patty Monroe" /></div>
      <div className="status-brandbar"><div className="status-sport"><img src="/assets/status-sport.svg" alt="Kickball" /></div></div>
    </header>
    <section className="status-overview">
      <h1>Free-agent</h1>
      <p className="status-confirmed"><img src="/assets/status-check.svg" alt="" />You’re on the free-agent list</p>
    </section>
    <section className="status-sections">
      <div className="status-section">
        <h2>Matching in progress</h2>
        <div className="status-section-body">
          <p>Nothing needed from you right now. We’ll notify you when you’re assigned.</p>
          <p className="status-steps"><span>Submitted</span> → <strong>Matching</strong> → Team assigned → Pay</p>
        </div>
      </div>
      <div className="status-section preferences-section">
        <div className="status-section-heading"><h2>Your preferences</h2><button type="button" aria-label="Edit preferences"><img src="/assets/status-edit.svg" alt="" /></button></div>
        <div className="status-section-body"><p>Experience: {experience}</p><p>Roster: {roster}</p><p>Playing with: {teammate}</p></div>
      </div>
      <div className="status-section league-section">
        <h2>Around the league</h2>
        <div className="league-feed">
          <LeagueUpdate count={3}><b>Blue Ballerz</b> joined Fall Kickball 2026</LeagueUpdate>
          <LeagueUpdate count={1}><b>Pink Panthers</b> better enjoy first place while it lasts 😏</LeagueUpdate>
          <LeagueUpdate count={17}>Week 1 matchup: <b>Blue Ballerz</b> vs <b>Pink Panthers</b></LeagueUpdate>
          <p>Commissioner update: “Opening night is almost full.”</p>
        </div>
        <button className="view-all" type="button" onClick={onCommissioner}>View all</button>
      </div>
    </section>
    {showNotice && <section className="status-notice" role="dialog" aria-modal="true" aria-labelledby="status-notice-title">
      <img className="status-notice-badge" src="/assets/status-confirmed.svg" alt="" />
      <button className="status-notice-x" type="button" aria-label="Close notification" onClick={() => setShowNotice(false)}><img src="/assets/status-close.svg" alt="" /></button>
      <div className="status-notice-content">
        <div><h2 id="status-notice-title">You’re on the free-agent list</h2><p>We’ll match you with a team and notify you by email and text. Once assigned, you’ll pay to confirm your spot.</p></div>
        <button className="close-button" type="button" onClick={() => setShowNotice(false)}>Close</button>
      </div>
    </section>}
    <button className="status-back" type="button" onClick={onBack}><ArrowLeft size={20} /> Back</button>
  </main>
}

function LeagueUpdate({ children, count }: { children: React.ReactNode; count: number }) {
  return <div className="league-update"><p>{children}</p><span><img src="/assets/status-thumb.svg" alt="" />{count}</span></div>
}

function Confirmation({ onClose }: { onClose: () => void }) {
  return <div className="modal-layer"><button className="modal-dismiss" aria-label="Close" onClick={onClose}></button><section className="confirmation-sheet">
    <button className="close-icon" onClick={onClose} aria-label="Close"><X size={18} /></button><div className="success-icon"><Check size={36} strokeWidth={3} /></div>
    <h2>You’re on the free-agent list</h2><p>We’ll match you with a team and notify you by email and text. Once assigned, you’ll pay to confirm your spot.</p>
    <button className="close-button" onClick={onClose}>View status</button>
  </section></div>
}

type CommissionerStage = 'overview' | 'players' | 'actions' | 'teams' | 'team-list' | 'assigned' | 'email-list' | 'email-edit'

type CommissionerPlayer = {
  id: string
  name: string
  image?: string
  photoClass?: string
  lines: string[]
  registrationId?: string
  email?: string
}

const commissionerPlayers: CommissionerPlayer[] = [
  { id: 'mock-patty', name: 'Patty Monroe', image: '/assets/player-patty.png', lines: ['Waiting 6 days · First season', 'Female roster category', 'Wants to play with Harley Jons', 'Former softball pitcher'] },
  { id: 'mock-harley', name: 'Harley Jons', image: '/assets/player-harley.png', lines: ['Waiting 5 days · First season', 'Female roster category', 'Wants to play with Patty Monroe', 'Former D1 softball player'] },
  { id: 'mock-jack', name: 'Jack “hammer” Wilson', image: '/assets/player-jack.png', photoClass: 'jack-photo', lines: ['Waiting 4 days · Experienced', 'Male roster category', 'Former recreational baseball player'] },
  { id: 'mock-pierre', name: 'Pierre Toots', image: '/assets/player-pierre.png', photoClass: 'pierre-photo', lines: ['Waiting 4 days · Experienced', 'Male roster category', 'Former recreational baseball player'] },
  { id: 'mock-grub', name: 'Grub Funster', image: '/assets/player-grub.png', lines: ['Waiting 1 day · Experienced', 'Male roster category'] },
]

function CommissionerScreen({ state, onBack }: { state: DemoState; onBack: () => void }) {
  const [stage, setStage] = useState<CommissionerStage>('overview')
  const [teamTab, setTeamTab] = useState('Issues')
  const [teamFilter, setTeamFilter] = useState('All')
  const [teamNotice, setTeamNotice] = useState('')
  const [newTeamOpen, setNewTeamOpen] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [extraTeams, setExtraTeams] = useState<string[]>([])
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])
  const [peopleTab, setPeopleTab] = useState('Players')
  const [peopleFilter, setPeopleFilter] = useState('Free agents')
  const [filterOpen, setFilterOpen] = useState(false)
  const [registeredPlayers, setRegisteredPlayers] = useState<CommissionerPlayer[]>([])
  const [emailEnabled, setEmailEnabled] = useState([true, true, false])
  const [emailTrigger, setEmailTrigger] = useState('')
  const [emailAudience, setEmailAudience] = useState('')
  const [assignedTeam, setAssignedTeam] = useState('Blue Ballerz')
  const [assignmentLabel, setAssignmentLabel] = useState('')
  const [assignmentDelivery, setAssignmentDelivery] = useState<'idle' | 'sending' | 'sent' | 'skipped' | 'failed'>('idle')
  const assigned = stage === 'assigned'
  const allPlayers = [...registeredPlayers, ...commissionerPlayers]
  const players = assigned ? allPlayers.filter((player) => !selectedPlayers.includes(player.id)) : allPlayers
  const freeAgentCount = 6 + registeredPlayers.length

  useEffect(() => {
    fetch('/api/registrations')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load registrations.')))
      .then(({ registrations }) => setRegisteredPlayers(registrations.map((item: any) => ({
        id: `registration-${item.id}`,
        registrationId: item.id,
        email: item.user.email,
        name: `${item.user.firstName} ${item.user.lastName}`,
        lines: [
          `Registered today · ${item.registration.experience || 'First season'}`,
          item.registration.rosterCategory || 'Open roster category',
          item.registration.preferredTeammates ? `Wants to play with ${item.registration.preferredTeammates}` : item.user.email,
          ...(item.registration.notes ? [item.registration.notes] : []),
        ],
      }))))
      .catch(() => setRegisteredPlayers([]))
  }, [])

  const togglePlayer = (id: string) => {
    const next = selectedPlayers.includes(id) ? selectedPlayers.filter((player) => player !== id) : [...selectedPlayers, id]
    setSelectedPlayers(next)
    setStage(next.length ? 'actions' : 'players')
  }
  const selectedRecords = allPlayers.filter((player) => selectedPlayers.includes(player.id))
  const selectionLabel = selectedRecords.length === 1 ? selectedRecords[0].name.split(' ')[0] : `${selectedRecords.length} players`
  const completeAssignment = async (team: string) => {
    setAssignmentLabel(selectedRecords.length === 1 ? selectedRecords[0].name : `${selectedRecords.length} players`)
    setAssignedTeam(team)
    setStage('assigned')
    const deliverablePlayers = selectedRecords.filter((player) => player.registrationId && player.email)
    if (!deliverablePlayers.length) return
    setAssignmentDelivery('sending')
    try {
      const results = await Promise.all(deliverablePlayers.map(async (player) => {
        const response = await fetch('/api/assignment-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registrationId: player.registrationId, email: player.email, team }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Email delivery failed.')
        return result.status
      }))
      setAssignmentDelivery(results.every((status) => status === 'sent') ? 'sent' : 'skipped')
      setRegisteredPlayers((current) => current.filter((player) => !selectedPlayers.includes(player.id)))
    } catch { setAssignmentDelivery('failed') }
  }

  if (stage === 'overview') return <main className="screen commissioner-screen overview-screen">
    <CommissionerHeader overview onBack={onBack} />
    <section className="commissioner-overview">
      <h1>Overview</h1>
      <div className="overview-scroll"><div className="overview-block">
        <div className="overview-heading"><h2>Week 1</h2><button type="button" aria-label="Previous week" disabled><img src="/assets/week-arrow-back.svg" alt="" /></button><button type="button" aria-label="Next week"><img src="/assets/week-arrow-forward.svg" alt="" /></button></div>
        <div className="readiness-list">
          <strong>Opening night · Friday, Sept 25</strong><span>82% ready</span>
          <button className="readiness-link" type="button" onClick={() => setStage('players')}><b>{freeAgentCount}</b> free agents need teams</button><span><b>4</b> players haven’t paid</span>
          <span><b>2</b> teams need coaches</span><span><b>7</b> players need shirt sizes</span>
          <span><b>3</b> waivers unsigned</span><span><b>1</b> game needs a referee</span>
          <span>Opening-week email needs to be scheduled</span>
        </div>
        <nav className="overview-links"><button onClick={() => setStage('players')}>People</button><button onClick={() => setStage('team-list')}>Teams</button><button>Schedule</button><button onClick={() => setStage('email-list')}>Email</button></nav>
      </div>
      <div className="overview-block activity-block"><h2>Activity</h2><div className="activity-list">
        <p><b>John S.</b> registered.<small>Just now</small></p>
        <p><b>Opening-week announcement</b> sent to <b>84 players</b><small>Just now</small></p>
        <p><b>Sarah J.</b> assigned to <b>Team Red</b><small>2m ago</small></p>
        <p><b>Dwight Murphy field</b> confirmed for <b>Week 2</b><small>3 hours ago</small></p>
        <p><b>Samuel J.</b> accepted coach invitation<small>3 hours ago</small></p>
      </div><button className="view-all">View all</button></div></div>
    </section>
  </main>

  if (stage === 'team-list') return <main className="screen commissioner-screen">
    <CommissionerHeader onBack={() => setStage('overview')} icon="/assets/commish-teams.svg" actionLabel="New team" onAction={() => setNewTeamOpen(true)} />
    <section className="players-content teams-content"><h1>Teams</h1>
      <div className="people-tabs team-tabs" role="tablist" aria-label="Team views">{['Issues', 'Roster', 'Standings'].map((tab) => <button key={tab} role="tab" aria-selected={teamTab === tab} className={teamTab === tab ? 'active' : ''} onClick={() => setTeamTab(tab)}>{tab}</button>)}</div>
      <div className="team-filters">{['All', 'No coach', 'Roster', 'Payments'].map((filter) => <button key={filter} className={teamFilter === filter ? 'active' : ''} onClick={() => setTeamFilter(filter)}>{filter}{filter === 'All' ? ` (${10 + extraTeams.length})` : ''}</button>)}</div>
      <div className="player-scroll">
        {teamTab === 'Standings' ? <p className="people-empty">Standings will appear after the first game.</p> : <>
          {teamFilter !== 'No coach' && <article className="team-issue-card"><img src="/assets/team-pitch-please.svg" alt="" /><div><h2>Pitch Please{teamTab === 'Issues' ? ' · 3 issues' : ''}</h2><p>11/14 players · Sarah Kim, coach</p>{teamTab === 'Issues' && <><p>3 roster spots open <button onClick={() => setStage('players')}>Assign players</button></p><p>2 players unpaid · $160 outstanding <button onClick={() => setTeamNotice('Payment reminder preview ready for Pitch Please. No email sent.')}>Send reminder</button></p><p>1 waiver missing <button onClick={() => setTeamNotice('Waiver request preview ready for Pitch Please. No email sent.')}>Request waiver</button></p></>}</div></article>}
          {(teamFilter === 'All' || teamFilter === 'No coach') && <article className="team-issue-card"><img src="/assets/team-invite-ballers.png" alt="" /><div><h2>Ball Busters</h2><p>14/14 players · No coach</p>{teamTab === 'Issues' && <><p>Coach needed <button onClick={() => { setPeopleTab('Coaches'); setStage('players') }}>Assign coach</button></p><p>3 invitations pending · 6 days <button onClick={() => setTeamNotice('Invitation resend preview ready for Ball Busters. No email sent.')}>Resend invites</button></p></>}</div></article>}
          {(teamFilter === 'All' || teamFilter === 'Roster') && <article className="team-issue-card"><img src="/assets/team-ball-of-duty.svg" alt="" /><div><h2>Ball of Duty</h2><p>13/14 players · Jason Martinez, coach</p>{teamTab === 'Issues' && <p>1 roster spot open · $80 potential revenue <button onClick={() => setStage('players')}>Assign players</button></p>}</div></article>}
          {extraTeams.map((name) => <article className="team-issue-card" key={name}><div><h2>{name}</h2><p>0/14 players · No coach</p><button onClick={() => setStage('players')}>Assign players</button></div></article>)}
        </>}
      </div>
    </section>
    {newTeamOpen && <form className="commissioner-drawer new-team-drawer" onSubmit={(event) => { event.preventDefault(); if (!newTeamName.trim()) return; setExtraTeams([...extraTeams, newTeamName.trim()]); setNewTeamName(''); setNewTeamOpen(false) }}><h2>New team</h2><Field label="Team name"><input required value={newTeamName} onChange={(event) => setNewTeamName(event.target.value)} placeholder="Enter" /></Field><div><button type="button" onClick={() => setNewTeamOpen(false)}>Cancel</button><button type="submit">Create team</button></div></form>}
    {teamNotice && <div className="assignment-toast" role="status"><span>{teamNotice}</span><button aria-label="Dismiss notification" onClick={() => setTeamNotice('')}><X size={24} /></button></div>}
  </main>

  if (stage === 'email-list') return <main className="screen commissioner-screen email-screen">
    <CommissionerHeader onBack={() => setStage('overview')} icon="/assets/commish-email-large.svg" actionLabel="Add email" actionIcon="/assets/commish-email-add.svg" onAction={() => setStage('email-edit')} />
    <section className="email-content">
      <h1>Automated emails</h1>
      <div className="filters email-filters"><span className="active">All (3)</span><span>Active (2)</span><span>Paused (1)</span><span>Draft (0)</span></div>
      <div className="email-list">
        {[
          ['Welcome new player', 'Trigger: When new player registers', 'To: New registrants', 'Last sent: 3 hours ago'],
          ['Payment reminder', 'Trigger: 2 days past due', 'To: Players with unpaid balance', 'Last sent: 6 hours ago'],
          ['Weather delay', 'Trigger: When a game is postponed', 'To: Affected teams', 'Last sent: Never'],
        ].map((email, index) => <article className="email-row" key={email[0]}>
          <div><h2>{email[0]}</h2>{email.slice(1).map((line) => <p key={line}>{line}</p>)}</div>
          <button className={`email-toggle${emailEnabled[index] ? ' enabled' : ''}`} type="button" role="switch" aria-checked={emailEnabled[index]} aria-label={`${emailEnabled[index] ? 'Pause' : 'Activate'} ${email[0]}`} onClick={() => setEmailEnabled((current) => current.map((value, item) => item === index ? !value : value))}><span /></button>
        </article>)}
      </div>
    </section>
  </main>

  if (stage === 'email-edit') return <main className="screen commissioner-screen email-screen email-edit-screen">
    <CommissionerHeader onBack={() => setStage('email-list')} icon="/assets/commish-email-large.svg" actionLabel="Send test" actionIcon="/assets/commish-send-test.svg" />
    <form className="email-editor" onSubmit={(event) => event.preventDefault()}>
      <div className="email-editor-title"><h1>New email</h1><button className="email-toggle enabled" type="button" role="switch" aria-checked="true" aria-label="Email active"><span /></button></div>
      <Field label="Email name"><input placeholder="Enter" /></Field>
      <SelectField label="Trigger" value={emailTrigger} onChange={setEmailTrigger} options={['When new player registers', '2 days past due', 'When a game is postponed']} />
      <SelectField label="To" value={emailAudience} onChange={setEmailAudience} options={['New registrants', 'Players with unpaid balance', 'Affected teams', 'All players']} />
      <Field label="Subject"><input placeholder="Enter" /></Field>
      <RichTextEditor />
      <div className="email-actions"><button type="button">Send test</button><button type="button" onClick={() => setStage('email-list')}>Cancel</button><button className="save" type="submit">Save</button></div>
    </form>
  </main>

  return <main className="screen commissioner-screen">
    <CommissionerHeader onBack={() => setStage('overview')} icon="/assets/commish-people.svg" />
    <section className="players-content"><h1>People</h1>
      <div className="people-tabs" role="tablist" aria-label="People categories">{['Issues', 'Players', 'Coaches', 'Referees'].map((tab) => <button key={tab} role="tab" aria-selected={peopleTab === tab} className={peopleTab === tab ? 'active' : ''} onClick={() => { setPeopleTab(tab); setSelectedPlayers([]); setStage('players'); setFilterOpen(false) }}>{tab}</button>)}</div>
      <div className="people-filter"><button className="people-filter-badge" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}>{peopleFilter}{peopleFilter === 'Free agents' ? ` (${freeAgentCount})` : ''}</button>{filterOpen && <div className="people-filter-menu">{['Free agents', 'All players', 'Shirt sizes'].map((filter) => <button key={filter} onClick={() => { setPeopleFilter(filter); setFilterOpen(false) }}>{filter}</button>)}</div>}</div>
      <div className="player-scroll" role="tabpanel">{peopleTab === 'Players' ? (peopleFilter === 'Shirt sizes' ? <p className="people-empty">No shirt-size records in this demo.</p> : players.map((player) => <PlayerCard key={player.id} {...player} selected={selectedPlayers.includes(player.id)} onClick={() => togglePlayer(player.id)} />)) : peopleTab === 'Issues' ? <button className="people-issue" onClick={() => { setPeopleTab('Players'); setPeopleFilter('Free agents') }}>{freeAgentCount} free agents need teams <ChevronRight size={18} /></button> : <p className="people-empty">No {peopleTab.toLowerCase()} added yet.</p>}</div>
    </section>
    {stage === 'actions' && <div className="commissioner-drawer action-drawer">
      <button onClick={() => setStage('teams')}><span><img className="add-team-icon" src="/assets/commish-add-team.svg?v=2" alt="" /></span>Add to team</button>
      <button><span><img src="/assets/commish-email.svg" alt="" /></span>Email</button>
      <button><span><img src="/assets/commish-delete.svg" alt="" /></span>Delete</button>
    </div>}
    {stage === 'teams' && <div className="commissioner-drawer team-drawer"><h2>Assign {selectionLabel} to a team</h2>
      <button onClick={() => completeAssignment('Ball Busters')}>Ball Busters — 11 of 16 players</button>
      <button onClick={() => completeAssignment('Kickin’ It')}>Kickin’ It — 13 of 16 players</button>
      <button className="recommended" onClick={() => completeAssignment('Blue Ballerz')}><strong>Blue Ballerz — 15 of 16 players</strong></button>
    </div>}
    {assigned && <div className="assignment-toast" role="status"><span>{assignmentLabel} assigned to {assignedTeam}{assignmentDelivery === 'sending' ? ' · Sending email…' : assignmentDelivery === 'sent' ? ' · Email sent' : assignmentDelivery === 'skipped' ? ' · Email not configured' : assignmentDelivery === 'failed' ? ' · Email failed' : ''}</span><button aria-label="Dismiss notification"><X size={24} /></button></div>}
  </main>
}

function CommissionerHeader({ overview = false, onBack, icon, actionLabel, actionIcon, onAction }: { overview?: boolean; onBack: () => void; icon?: string; actionLabel?: string; actionIcon?: string; onAction?: () => void }) {
  return <header className="commissioner-shell">
    <div className="commissioner-header">{overview ? <strong>Fall Kickball 2026</strong> : <button onClick={onBack}><ArrowLeft size={24} /> Back</button>}<div className="commissioner-avatar"><img src="/assets/commish-avatar.png" alt="Commissioner" /></div></div>
    <div className="commissioner-brand"><div className="sport-icon"><img src={icon || (overview ? '/assets/commish-task.svg' : '/assets/commish-player-sport.svg')} alt="" /></div><button type="button" onClick={onAction}><img src={actionIcon || '/assets/commish-add.svg'} alt="" /> {actionLabel || (overview ? 'Add' : 'Add Player')}</button></div>
  </header>
}

function PlayerCard({ name, lines, image, photoClass = '', selected = false, onClick }: { name: string; lines: string[]; image?: string; photoClass?: string; selected?: boolean; onClick?: () => void }) {
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const content = <><div className={`player-avatar${selected ? ' selected' : ''}`}>{image ? <img className={`player-photo ${photoClass}`} src={image} alt="" /> : <span className="player-initials">{initials}</span>}{selected && <><span className="player-selection-overlay" /><img className="player-selection-check" src="/assets/player-selected-check.svg" alt="Selected" /></>}</div><div><h3>{name}</h3>{lines.map((line) => <p key={line}>{line}</p>)}</div></>
  return onClick ? <button className="player-card player-card-button" onClick={onClick}>{content}</button> : <article className="player-card">{content}</article>
}

const editorTools = [
  { command: 'bold', label: 'Bold', icon: '/assets/editor-bold.svg' },
  { command: 'italic', label: 'Italic', icon: '/assets/editor-italic.svg' },
  { command: 'strikeThrough', label: 'Strikethrough', icon: '/assets/editor-align-left.svg' },
  { command: 'justifyLeft', label: 'Align left', icon: '/assets/editor-align-center.svg' },
  { command: 'justifyCenter', label: 'Align center', icon: '/assets/editor-align-right.svg' },
  { command: 'justifyRight', label: 'Align right', icon: '/assets/editor-align-right-exact.svg' },
]

function RichTextEditor() {
  const editorRef = useRef<HTMLDivElement>(null)
  const colorToolRef = useRef<HTMLDivElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [activeCommands, setActiveCommands] = useState<string[]>([])
  const [colorMenuOpen, setColorMenuOpen] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)

  const refreshCommands = () => {
    if (!editorRef.current?.contains(document.getSelection()?.anchorNode || null)) return
    setActiveCommands(editorTools.filter(({ command }) => document.queryCommandState(command)).map(({ command }) => command))
  }

  useEffect(() => {
    document.addEventListener('selectionchange', refreshCommands)
    const closeColorMenu = (event: MouseEvent) => {
      if (!colorToolRef.current?.contains(event.target as Node)) setColorMenuOpen(false)
    }
    document.addEventListener('mousedown', closeColorMenu)
    return () => {
      document.removeEventListener('selectionchange', refreshCommands)
      document.removeEventListener('mousedown', closeColorMenu)
    }
  }, [])

  const runCommand = (command: string, value?: string) => {
    editorRef.current?.focus()
    if (savedRangeRef.current) {
      const selection = document.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(savedRangeRef.current)
    }
    document.execCommand(command, false, value)
    savedRangeRef.current = null
    refreshCommands()
  }

  const rememberSelection = () => {
    const selection = document.getSelection()
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) savedRangeRef.current = selection.getRangeAt(0).cloneRange()
  }

  return <div className="field email-message"><span id="email-message-label">Message</span><div className="email-message-field">
    <div ref={editorRef} className="rich-text-input" contentEditable suppressContentEditableWarning data-placeholder="Enter description" role="textbox" aria-multiline="true" aria-labelledby="email-message-label" onInput={refreshCommands} />
    <div className="editor-toolbar">
      <div className="color-tool-wrap" ref={colorToolRef}><button className={selectedColor ? 'active' : ''} type="button" aria-label="Text color" aria-expanded={colorMenuOpen} title="Text color" onMouseDown={(event) => { event.preventDefault(); rememberSelection() }} onClick={() => setColorMenuOpen((open) => !open)}><img src="/assets/editor-color.svg" alt="" /></button>{colorMenuOpen && <div className="color-palette" role="menu" aria-label="Text colors">{['#19191e','#616873','#04abb3','#2472fd','#d31510','#7c3aed'].map((color) => <button type="button" role="menuitem" aria-label={`Use ${color}`} key={color} style={{ backgroundColor: color }} onClick={() => { runCommand('foreColor', color); setSelectedColor(color); setColorMenuOpen(false) }} />)}</div>}</div>
      {editorTools.map(({ command, label, icon }) => <button className={activeCommands.includes(command) ? 'active' : ''} type="button" key={command} aria-label={label} aria-pressed={activeCommands.includes(command)} title={label} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand(command)}><img src={icon} alt="" /></button>)}
    </div>
  </div></div>
}

function formatExperience(value: string) { return value || 'First season' }

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return <label className="field"><span>{label}{optional && <small>Optional</small>}</span>{children}</label>
}

function PhoneField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)]
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]
  const limits = [3, 3, 4]

  const updatePart = (index: number, nextValue: string) => {
    const nextParts = [...parts]
    nextParts[index] = nextValue.replace(/\D/g, '').slice(0, limits[index])
    onChange(nextParts.join(''))
    if (nextParts[index].length === limits[index] && index < refs.length - 1) refs[index + 1].current?.focus()
  }

  return <div className="field phone-group">
    <span id="mobile-number-label">Mobile number</span>
    <div className="phone-field" role="group" aria-labelledby="mobile-number-label">
      <span aria-hidden="true">(</span>
      <input ref={refs[0]} required inputMode="numeric" autoComplete="tel-area-code" aria-label="Area code" maxLength={3} value={parts[0]} onChange={(e) => updatePart(0, e.target.value)} placeholder="___" />
      <span aria-hidden="true">)</span>
      <span aria-hidden="true">-</span>
      <input ref={refs[1]} required inputMode="numeric" autoComplete="tel-local-prefix" aria-label="Phone prefix" maxLength={3} value={parts[1]} onChange={(e) => updatePart(1, e.target.value)} onKeyDown={(e) => { if (e.key === 'Backspace' && !parts[1]) refs[0].current?.focus() }} placeholder="___" />
      <span aria-hidden="true">-</span>
      <input ref={refs[2]} required inputMode="numeric" autoComplete="tel-local-suffix" aria-label="Phone line number" maxLength={4} value={parts[2]} onChange={(e) => updatePart(2, e.target.value)} onKeyDown={(e) => { if (e.key === 'Backspace' && !parts[2]) refs[1].current?.focus() }} placeholder="____" />
    </div>
  </div>
}

function SelectField({ label, value, onChange, options, required }: { label: string; value: string; onChange: (value: string) => void; options: string[]; required?: boolean }) {
  const [open, setOpen] = useState(false)
  const selectRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => {
      if (!selectRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return <div className={`field select-wrap${open ? ' is-open' : ''}${value ? ' is-filled' : ''}`} ref={selectRef}>
    <span id={`${label.replace(/\W+/g, '-').toLowerCase()}-label`}>{label}</span>
    <button
      className="select-trigger"
      type="button"
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-required={required}
      aria-labelledby={`${label.replace(/\W+/g, '-').toLowerCase()}-label`}
      onClick={() => setOpen((current) => !current)}
    >
      <span>{value || 'Select..'}</span>
      <ChevronDown className="select-chevron" size={24} />
    </button>
    {open && <div className="select-menu" role="listbox" aria-label={label}>
      {options.map((option) => <button
        className="select-option"
        type="button"
        role="option"
        aria-selected={value === option}
        key={option}
        onClick={() => { onChange(option); setOpen(false) }}
      >{option}</button>)}
    </div>}
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
