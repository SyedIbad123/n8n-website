export default function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" className="flex items-center gap-2.5" aria-label="QuickConnect home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-md shadow-brand-600/25">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" aria-hidden="true">
              <path d="M13.5 2 4 14h6.5L9.5 22 20 9.5h-6.5L13.5 2Z" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Quick<span className="text-brand-600">Connect</span>
          </span>
        </a>
        <a
          href="#contact"
          className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          Contact us
        </a>
      </nav>
    </header>
  );
}
