import { Workspace } from "@/components/workspace";
import { auth, signIn } from "@/auth";

export const dynamic = "force-dynamic";

async function signInWithGoogle() {
  "use server";
  await signIn("google");
}

function SetupPage() {
  return (
    <main className="setup-screen">
      <div className="setup-card">
        <div className="brand-mark">N</div>
        <p className="eyebrow">NORTHSTAR · ORGANIZATIONAL MEMORY</p>
        <h1>Connect the secure knowledge workspace.</h1>
        <p className="muted">
          Configure Google OAuth and a Neon Postgres database using the deployment guide.
          Sign-in and private workspace data remain disabled until both are configured.
        </p>
        <a className="button button-primary" href="https://github.com/itsshristijha/org-knowledge-base#deploy-to-vercel">
          Read deployment setup
        </a>
      </div>
    </main>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  if (
    !process.env.AUTH_SECRET ||
    !process.env.AUTH_GOOGLE_ID ||
    !process.env.AUTH_GOOGLE_SECRET ||
    !process.env.DATABASE_URL
  ) {
    return <SetupPage />;
  }

  const session = await auth();
  const user = session?.user;
  if (!user) {
    const { auth } = await searchParams;
    return (
      <main className="login-screen">
        <section className="login-panel">
          <div className="login-copy">
            <div className="brand-lockup"><span className="brand-mark">N</span><span>northstar</span></div>
            <p className="eyebrow">TEAM KNOWLEDGE · MADE SEARCHABLE</p>
            <h1>Keep good decisions from getting lost.</h1>
            <p className="login-description">
              Search the reasoning behind past decisions, trace answers back to their sources,
              and make every handover easier to trust.
            </p>
            <div className="login-assurances">
              <span><i>01</i> Grounded in your documents</span>
              <span><i>02</i> Private to your account</span>
              <span><i>03</i> Your history stays yours</span>
            </div>
          </div>
          <div className="login-card">
            <div className="login-card-icon">✳</div>
            <h2>Your knowledge, in context.</h2>
            <p className="muted">Sign in to open your private workspace.</p>
            {auth === "failed" && <p className="error-message">Google sign-in could not be completed. Please try again.</p>}
            <form action={signInWithGoogle}>
              <button className="button button-google" type="submit">
                <GoogleMark />
                Continue with Google
                <span aria-hidden="true">→</span>
              </button>
            </form>
            <p className="fine-print">Protected sign-in · Your documents are never public</p>
          </div>
        </section>
        <footer className="login-footer">A clearer memory for the work that matters.</footer>
      </main>
    );
  }

  return <Workspace userEmail={user.email ?? "Signed-in user"} />;
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="google-mark">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.25 5.47-4.73 7.16l7.66 5.95c4.47-4.13 7.11-10.22 7.11-17.58Z" />
      <path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.98 23.98 0 0 0 0 21.56l7.98-6.19Z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.87l-7.66-5.95c-2.13 1.43-4.85 2.27-8.24 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
    </svg>
  );
}
