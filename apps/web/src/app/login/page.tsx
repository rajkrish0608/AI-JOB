import { login } from "./actions"

export default async function LoginPage(props: {
  searchParams: Promise<{ message: string }>
}) {
  const searchParams = await props.searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 font-sans">
      {/* Strict Card Design */}
      <div 
        className="w-full max-w-md bg-[var(--bg-raised)] border border-[var(--border)] rounded-[12px] p-[28px] transition-colors duration-200 hover:bg-[var(--bg-overlay)] hover:border-[var(--border-hover)]"
      >
        <form>
          <div className="space-y-2 mb-8">
            {/* Cinematic Serif H1 */}
            <h1 className="font-serif text-3xl font-normal text-[var(--text-1)] tracking-tight">
              AI Job Apply
            </h1>
            <p className="text-[var(--text-2)] text-sm">
              Enter your email below to receive a magic link
            </p>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="space-y-2">
              <label htmlFor="email" className="text-[var(--text-3)] text-xs font-medium uppercase tracking-wider">
                Email Address
              </label>
              <input 
                id="email" 
                name="email" 
                type="email" 
                placeholder="m@example.com" 
                required 
                className="w-full bg-[var(--bg-overlay)] border border-[var(--border)] rounded-md px-3 py-2 text-[var(--text-1)] placeholder-[var(--text-4)] focus:outline-none focus:border-[var(--border-hover)] focus:ring-1 focus:ring-[var(--border-hover)] transition-all"
              />
            </div>
          </div>
          
          <div className="flex flex-col space-y-4">
            {/* Strict Primary Button Design */}
            <button 
              formAction={login}
              className="w-full bg-[var(--accent)] text-[var(--white)] font-medium text-[13px] px-[18px] py-[9px] rounded-[7px] transition-opacity duration-200 hover:opacity-80 flex items-center justify-center"
            >
              Send Magic Link
            </button>
            
            {searchParams?.message && (
              <p className="text-sm text-center text-[var(--text-3)] p-3 bg-[var(--bg-overlay)] border border-[var(--border)] rounded-md">
                {searchParams.message}
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
