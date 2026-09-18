/**
 * §3 pricing — single source of truth for the plan table.
 *
 * Shared by the landing-page teaser (`#pricing`) and the standalone
 * `/pricing` route so the two can never drift apart.
 */

export interface Plan {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  features: string[];
  cta: string;
  highlight: boolean;
}

export const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    blurb: "For a single aspirant grinding through the syllabus.",
    features: [
      "Unlimited 1:1 AI tutor chat",
      "3 study rooms with your batch",
      "30-day message history",
      "Community support",
    ],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$4",
    cadence: "per month",
    blurb: "For the full prep cycle, first mock to result day.",
    features: [
      "Everything in Free",
      "Unlimited study rooms",
      "Full history + global search",
      "File and image attachments",
      "Priority model access",
    ],
    cta: "Start free, upgrade anytime",
    highlight: true,
  },
  {
    name: "Campus",
    price: "Custom",
    cadence: "annual",
    blurb: "For coaching institutes running batch rooms.",
    features: [
      "Batch-sized study rooms",
      "Admin-managed membership",
      "Shared room topics for the tutor",
      "Onboarding support",
    ],
    cta: "Talk to us",
    highlight: false,
  },
];

export interface Faq {
  q: string;
  a: string;
}

export const PRICING_FAQ: Faq[] = [
  {
    q: "Is my data used for training?",
    a: "No, unless you turn it on. Training opt-in is off by default and is a per-person setting; in a study room every member has to opt in before anything can be routed to a training pipeline.",
  },
  {
    q: "Is pricing per token?",
    a: "No. Plans are per person per month, so a long thread with the assistant costs the same as a short one. Rate limits (30 messages/minute, 10 AI invocations/minute) apply on every plan.",
  },
  {
    q: "What happens to my conversations if I downgrade?",
    a: "Nothing is deleted. You keep every conversation you can see; the plan only changes what you can create — the Free tier caps new study rooms at three.",
  },
  {
    q: "Can I export everything and leave?",
    a: "Yes. Settings → Privacy & data exports every conversation you have access to as JSON, and account deletion removes your profile and every conversation you own.",
  },
  {
    q: "Does AARAGATE guarantee a GATE score or rank?",
    a: "No — and anyone who promises that is selling you something. AARAGATE is a study tool: it explains, drills, and keeps your batch honest. The rank comes from your work.",
  },
  {
    q: "Is AARAGATE affiliated with GATE or any organising institute?",
    a: "No. AARAGATE is an independent preparation tool and is not endorsed by, affiliated with, or connected to GATE/PMC or any organising institute.",
  },
];
