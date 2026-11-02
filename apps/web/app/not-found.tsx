import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-20 text-center max-w-lg mx-auto">
      <div className="w-16 h-16 mb-4 rounded-full border border-[var(--color-primary-gold)]/30 bg-dark-card flex items-center justify-center shadow-[0_0_25px_rgba(201,162,74,0.15)]">
        <span className="text-xl font-serif font-bold text-[var(--color-primary-gold)]">404</span>
      </div>

      <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-wider text-[var(--color-primary-gold)] uppercase mb-3">
        Page Not Found
      </h1>

      <p className="text-sm text-neutral-400 mb-8 font-sans max-w-md">
        The requested literature or page does not exist, has been renamed, or may have been moved.
      </p>

      <Link href="/">
        <Button variant="primary" size="md">
          Return to Home
        </Button>
      </Link>
    </main>
  );
}
