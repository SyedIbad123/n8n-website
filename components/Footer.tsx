export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6 lg:px-8">
        <p>
          &copy; {new Date().getFullYear()} <span className="font-medium text-slate-700">QuickConnect</span>. All rights reserved.
        </p>
        <p>Built with care. Powered by automation.</p>
      </div>
    </footer>
  );
}
