import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center max-w-lg mx-auto">
      <div className="w-14 h-14 mb-4 rounded-full border border-[#C9A24A]/30 bg-[#161616] flex items-center justify-center">
        <span className="text-xl text-[#C9A24A]">404</span>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold tracking-wider text-[#C9A24A] uppercase mb-3">
        Page Not Found
      </h1>

      <p className="text-sm text-[#888888] mb-8 font-sans">
        The requested page does not exist or may have been moved.
      </p>

      <Link
        href="/"
        className="px-6 py-2.5 rounded-lg border border-[#C9A24A] bg-[#C9A24A] text-black text-xs font-semibold tracking-wider uppercase hover:bg-[#b89139] transition-colors"
      >
        Return to Home
      </Link>
    </main>
  );
}

