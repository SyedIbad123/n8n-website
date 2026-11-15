import Navbar from "@/components/Navbar";
import ContactForm from "@/components/ContactForm";
import Footer from "@/components/Footer";

const highlights = [
  { title: "Fast replies", text: "We usually respond within one business day." },
  { title: "Real people", text: "Every message is read by our team — no bots." },
  { title: "Private by default", text: "Your details are only used to reply to you." },
];

export default function Home() {
  return (
    <div id="top" className="flex min-h-screen flex-col">
      <Navbar />

      <main className="relative flex-1 overflow-hidden">
        {/* Decorative background */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-x-0 top-0 h-[36rem] bg-gradient-to-b from-brand-50 via-white to-white" />
          <div className="absolute -top-24 left-1/2 h-[28rem] w-[56rem] -translate-x-1/2 rounded-full bg-brand-100/60 blur-3xl" />
        </div>

        <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:px-8 lg:pt-24">
          <div className="lg:pt-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-3 py-1 text-xs font-medium text-brand-700 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              Now accepting new projects
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Let&apos;s Work <span className="text-brand-600">Together</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-600">
              Have a project in mind, a question, or just want to say hello? Send us a message and
              we&apos;ll get back to you as soon as possible.
            </p>

            <ul className="mt-10 space-y-5">
              {highlights.map((h) => (
                <li key={h.title} className="flex gap-4">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-600/10 text-brand-600">
                    <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
                      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
                    </svg>
                  </span>
                  <div>
                    <p className="font-semibold text-ink">{h.title}</p>
                    <p className="text-sm text-slate-600">{h.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div id="contact" className="scroll-mt-24">
            <ContactForm />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
