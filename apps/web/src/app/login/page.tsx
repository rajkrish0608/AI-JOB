import { login, signup } from "./actions"

export default async function LoginPage(props: {
  searchParams: Promise<{ message?: string }>
}) {
  const searchParams = await props.searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 font-sans">
      <div className="w-full max-w-md bg-[var(--bg-raised)] border border-[var(--border)] rounded-[12px] p-[28px] transition-colors duration-200">
        <form className="space-y-6">
          <div className="space-y-1">
            <h1 className="font-serif text-3xl font-normal text-[var(--text-1)] tracking-tight">AI Job Apply</h1>
            <p className="text-[var(--text-2)] text-sm">Sign in to your account to continue</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-[var(--text-3)] text-xs font-medium uppercase tracking-wider">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full bg-[var(--bg-overlay)] border border-[var(--border)] rounded-md px-3 py-2 text-[var(--text-1)] placeholder-[var(--text-4)] focus:outline-none focus:border-[var(--border-hover)] focus:ring-1 focus:ring-[var(--border-hover)] transition-all"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-[var(--text-3)] text-xs font-medium uppercase tracking-wider">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete="current-password"
                className="w-full bg-[var(--bg-overlay)] border border-[var(--border)] rounded-md px-3 py-2 text-[var(--text-1)] placeholder-[var(--text-4)] focus:outline-none focus:border-[var(--border-hover)] focus:ring-1 focus:ring-[var(--border-hover)] transition-all"
              />
            </div>
          </div>

          {searchParams?.message && (
            <p className="text-sm text-center text-[var(--text-3)] p-3 bg-[var(--bg-overlay)] border border-[var(--border)] rounded-md">
              {decodeURIComponent(searchParams.message)}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <button
              formAction={login}
              className="w-full bg-[var(--accent)] text-[var(--white)] font-medium text-[13px] px-[18px] py-[10px] rounded-[7px] transition-opacity duration-200 hover:opacity-80"
            >
              Sign In
            </button>
            <button
              formAction={signup}
              className="w-full bg-transparent text-[var(--text-2)] font-medium text-[13px] px-[18px] py-[10px] rounded-[7px] border border-[var(--border)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-1)] transition-colors"
            >
              Create Account
            </button>
          </div>

          <p className="text-center text-[11px] text-[var(--text-3)]">
            Demo account: <span className="font-mono text-[var(--text-2)]">demo@aijobapply.com</span> / <span className="font-mono text-[var(--text-2)]">Demo@12345</span>
          </p>
        </form>
      </div>
    </div>
  )
}
