import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Send, Mail, MessageSquare, CheckCircle2, AlertCircle } from "lucide-react";
import emailjs from "@emailjs/browser";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Us — CampusCache" },
      { name: "description", content: "Send feedback, report an issue, or ask a question to the CampusCache team." },
    ],
  }),
  component: ContactPage,
});

const SUBJECTS = [
  "General Feedback",
  "Bug Report",
  "Feature Request",
  "Content Issue",
  "Query / Question",
  "Other",
];

type Status = "idle" | "sending" | "success" | "error";

function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;

    setStatus("sending");
    setErrorMsg("");

    const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
    const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

    if (!serviceId || !templateId || !publicKey) {
      // Fallback: open mailto link if EmailJS not configured
      const body = encodeURIComponent(
        `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`
      );
      window.location.href = `mailto:vinsaan28@gmail.com?subject=${encodeURIComponent(`[CampusCache] ${subject}`)}&body=${body}`;
      setStatus("idle");
      return;
    }

    try {
      await emailjs.send(
        serviceId,
        templateId,
        {
          user_name: name,
          user_email: email,
          subject: subject,
          message: message,
          to_email: "vinsaan28@gmail.com",
          reply_to: email,
        },
        publicKey
      );
      setStatus("success");
      setName(""); setEmail(""); setSubject(SUBJECTS[0]); setMessage("");
    } catch (err) {
      console.error("EmailJS error:", err);
      setErrorMsg("Failed to send message. Please try emailing us directly at vinsaan28@gmail.com");
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero */}
      <section className="border-b border-border/60 bg-card/30">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <p className="text-xs uppercase tracking-[0.3em] text-mint font-mono">— get in touch</p>
          <h1 className="mt-3 font-serif text-4xl sm:text-5xl text-foreground">
            Contact <span className="italic-serif text-gradient-primary">us</span>
          </h1>
          <p className="mt-3 text-muted-foreground max-w-lg">
            Have feedback, found a bug, or just want to say something? We read every message.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid lg:grid-cols-[1fr_360px] gap-16">

          {/* Form */}
          <div>
            {status === "success" ? (
              <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-up">
                <div className="h-20 w-20 rounded-full bg-mint/10 flex items-center justify-center mb-6">
                  <CheckCircle2 className="h-10 w-10 text-mint" />
                </div>
                <h2 className="font-serif text-3xl text-foreground">Message sent!</h2>
                <p className="mt-3 text-muted-foreground max-w-sm">
                  Thanks for reaching out. We'll get back to you at <span className="text-foreground font-medium">{email || "your email"}</span> as soon as possible.
                </p>
                <button
                  onClick={() => setStatus("idle")}
                  className="mt-8 text-sm text-mint hover:underline underline-offset-4"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6 animate-fade-up">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="contact-name" className="text-sm text-foreground">Your name <span className="text-destructive">*</span></Label>
                    <Input
                      id="contact-name"
                      placeholder="Shashvat"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="h-11 bg-card/60 border-border/60 focus:border-mint/60"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-email" className="text-sm text-foreground">Email address <span className="text-destructive">*</span></Label>
                    <Input
                      id="contact-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-11 bg-card/60 border-border/60 focus:border-mint/60"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact-subject" className="text-sm text-foreground">Subject</Label>
                  <select
                    id="contact-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full h-11 rounded-md border border-border/60 bg-card/60 px-3 text-sm text-foreground focus:outline-none focus:border-mint/60 transition-colors"
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s} className="bg-card text-foreground">{s}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact-message" className="text-sm text-foreground">Message <span className="text-destructive">*</span></Label>
                  <textarea
                    id="contact-message"
                    rows={7}
                    placeholder="Tell us what's on your mind…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    className="w-full rounded-md border border-border/60 bg-card/60 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-mint/60 transition-colors resize-none"
                  />
                  <p className="text-xs text-muted-foreground text-right">{message.length} / 2000</p>
                </div>

                {status === "error" && (
                  <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>{errorMsg}</p>
                  </div>
                )}

                <Button
                  id="contact-submit"
                  type="submit"
                  disabled={status === "sending" || !name.trim() || !email.trim() || !message.trim()}
                  size="lg"
                  className="w-full h-12 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-soft"
                >
                  <Send className="h-4 w-4" />
                  {status === "sending" ? "Sending…" : "Send message"}
                </Button>
              </form>
            )}
          </div>

          {/* Side info */}
          <div className="space-y-8 lg:pt-2">
            <InfoCard
              icon={Mail}
              title="Email us directly"
              desc="Prefer email? Reach us at"
              link="mailto:vinsaan28@gmail.com"
              linkLabel="vinsaan28@gmail.com"
            />
            <InfoCard
              icon={MessageSquare}
              title="Response time"
              desc="We typically respond within 24–48 hours. For urgent issues, mention it in your subject line."
            />

            <div className="rounded-xl border border-border/60 bg-card/40 p-6">
              <h3 className="font-serif text-lg text-foreground mb-4">What can you contact us about?</h3>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                {[
                  "🐛  Bug reports & broken links",
                  "💡  Feature suggestions",
                  "📄  Wrong or duplicate content",
                  "🙋  Account & upload help",
                  "💬  General feedback",
                  "🤝  Collaboration & contributions",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  desc,
  link,
  linkLabel,
}: {
  icon: typeof Mail;
  title: string;
  desc: string;
  link?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="h-10 w-10 shrink-0 rounded-lg bg-mint/10 flex items-center justify-center">
        <Icon className="h-5 w-5 text-mint" />
      </div>
      <div>
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {desc}{" "}
          {link && (
            <a href={link} className="text-mint hover:underline underline-offset-4">
              {linkLabel}
            </a>
          )}
        </p>
      </div>
    </div>
  );
}
