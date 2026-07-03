import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Globe2,
  HeartHandshake,
  Languages,
  Lock,
  MessageCircleHeart,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  Watch,
  BellRing,
  EyeOff,
} from 'lucide-react';
import Logo from '../components/Logo';

/**
 * About Tefillah — sourced from the team's ABOUT TEFFILLAH brief.
 * Lays out the mission, objectives, services, and security commitments in the
 * same classic-modern palette as the rest of the site.
 */
export default function AboutPage() {
  return (
    <div>
      {/* HERO */}
      <section>
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 pb-16 text-center anim-fade-up">
          <Logo size="lg" />
          <p className="eyebrow mt-8">About Tefillah</p>
          <h1 className="font-serif text-4xl sm:text-5xl mt-5">A sacred space for prayer.</h1>
          <p
            className="mt-6 max-w-2xl mx-auto font-serif italic text-lg sm:text-xl leading-relaxed"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Tefillah is a secure, inclusive prayer platform that connects believers and
            seekers worldwide. Designed to transcend borders and barriers, Tefillah enables
            people to share prayer requests, offer intercession, and stand together in faith
            — especially for those in places where gathering is hard or unsafe.
          </p>
        </div>
      </section>

      {/* OBJECTIVES */}
      <section className="border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <p className="eyebrow">Objectives</p>
            <h2 className="font-serif text-3xl sm:text-4xl mt-5">Why Tefillah exists.</h2>
          </div>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <Globe2 size={22} />,
                title: 'Build a global prayer community',
                copy: 'Foster an inclusive, virtual congregation where users share testimonies, encourage one another, and grow together spiritually.',
              },
              {
                icon: <HeartHandshake size={22} />,
                title: 'Facilitate intercessory prayer worldwide',
                copy: 'Enable users to submit and respond to prayer requests for illness, financial hardship, emotional support, crises, and beyond.',
              },
              {
                icon: <ShieldCheck size={22} />,
                title: 'Support individuals in restricted regions',
                copy: 'Provide a discreet, reliable platform for spiritual expression where physical gatherings are limited or unsafe.',
              },
              {
                icon: <EyeOff size={22} />,
                title: 'Protect identities with anonymity',
                copy: 'Let vulnerable users request and receive prayer without exposure or risk to themselves and their families.',
              },
              {
                icon: <Users size={22} />,
                title: 'Foster unity and connectivity',
                copy: 'Connect people across cultures and languages to create a shared network of hope, prayer, and mutual encouragement.',
              },
              {
                icon: <Sparkles size={22} />,
                title: 'More than a tool',
                copy: 'A catalyst for spiritual connection, emotional healing, and community resilience for those who need it most.',
              },
            ].map((item, i) => (
              <article
                key={item.title}
                className="surface-card p-6 anim-fade-up"
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent)' }}
                >
                  {item.icon}
                </div>
                <h3 className="font-serif text-xl mt-4">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {item.copy}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* PURPOSE AND IMPACT */}
      <section className="border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-20">
          <p className="eyebrow text-center">Purpose & Impact</p>
          <h2 className="font-serif text-3xl sm:text-4xl mt-5 text-center">
            A versatile, secure environment for the moments that matter most.
          </h2>
          <p
            className="mt-6 max-w-3xl mx-auto text-base sm:text-lg leading-relaxed text-center"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Tefillah aims to be more than a digital tool — it is intended as a catalyst for
            spiritual connection, emotional healing, and community resilience.
          </p>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {[
              'Sharing requests with confidence.',
              'Praying together across borders.',
              'Supporting those in distress regardless of location.',
              'Encouraging perseverance in challenging environments.',
            ].map((line) => (
              <div
                key={line}
                className="flex items-start gap-3 p-4 rounded-lg"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <Sparkles
                  size={16}
                  className="mt-1 shrink-0"
                  style={{ color: 'var(--color-accent)' }}
                />
                <p className="text-sm sm:text-base">{line}</p>
              </div>
            ))}
          </div>

          <p
            className="mt-8 max-w-3xl mx-auto text-center font-serif italic"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Tefillah seeks to nurture a compassionate global network united in prayer,
            hope, and faith — especially for those facing persecution or restriction.
          </p>
        </div>
      </section>

      {/* CORE SERVICES AND FEATURES */}
      <section className="border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <p className="eyebrow">Core Services & Features</p>
            <h2 className="font-serif text-3xl sm:text-4xl mt-5">
              Designed for the way prayer happens.
            </h2>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <Globe2 size={20} />,
                title: 'Global prayer feed',
                copy: 'Post and browse prayer requests and testimonies from around the world; filter by need, region, or topic.',
              },
              {
                icon: <HeartHandshake size={20} />,
                title: 'Intercessory prayer tools',
                copy: 'Join prayer chains, mark requests you are praying for, and send encouragement or scripture-based support.',
              },
              {
                icon: <EyeOff size={20} />,
                title: 'Anonymous requests',
                copy: 'Submit prayer needs anonymously to protect identity in restricted or sensitive environments.',
              },
              {
                icon: <Users size={20} />,
                title: 'Private groups & circles',
                copy: 'Create or join small groups for focused prayer, study, or mutual support with role-based privacy controls.',
              },
              {
                icon: <BookOpen size={20} />,
                title: 'Testimony updates',
                copy: 'Share answered-prayer stories and progress updates to encourage others and build faith.',
              },
              {
                icon: <Languages size={20} />,
                title: 'Multi-language support',
                copy: 'Localized UI and translation tools to enable cross-language connection and understanding.',
              },
              {
                icon: <BellRing size={20} />,
                title: 'Push reminders & prayer schedules',
                copy: 'Set reminders for personal or group prayer times and devotional routines.',
              },
              {
                icon: <MessageCircleHeart size={20} />,
                title: 'Secure messaging',
                copy: 'Encrypted one-to-one and group messaging for pastoral care, counselling, and confidential support.',
              },
              {
                icon: <UserCheck size={20} />,
                title: 'Moderation & safety tools',
                copy: 'Community guidelines, reporting, and moderation to maintain a respectful, faith-centred environment.',
              },
            ].map((feature, i) => (
              <article
                key={feature.title}
                className="surface-card p-5 anim-fade-up"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent)' }}
                  >
                    {feature.icon}
                  </span>
                  <h3 className="font-serif text-lg">{feature.title}</h3>
                </div>
                <p
                  className="mt-3 text-sm leading-relaxed"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {feature.copy}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* PRIVACY & SECURITY */}
      <section className="border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-20">
          <div
            className="surface-card p-8 sm:p-12 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-10 items-start"
            style={{ background: 'var(--color-surface)' }}
          >
            <div>
              <p className="eyebrow inline-flex items-center gap-2">
                <Lock size={14} /> Privacy & Security
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl mt-5">
                Safeguards built into the foundation.
              </h2>
              <p className="mt-4 text-base sm:text-lg" style={{ color: 'var(--color-text-secondary)' }}>
                Tefillah holds the words you bring before God as sacred. Privacy is not an
                afterthought; it is the floor on which the service is built.
              </p>
              <ul className="mt-6 space-y-3 text-sm sm:text-base">
                {[
                  { icon: <Lock size={16} />, text: 'End-to-end encryption for private communications.' },
                  { icon: <EyeOff size={16} />, text: 'Anonymous posting option for sensitive requests.' },
                  { icon: <ShieldCheck size={16} />, text: 'Minimal data retention and strong access controls.' },
                  { icon: <Watch size={16} />, text: 'Moderation and reporting to protect users and uphold community standards.' },
                ].map((row) => (
                  <li key={row.text} className="flex items-start gap-3">
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent)' }}
                    >
                      {row.icon}
                    </span>
                    <span>{row.text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/privacy" className="btn-ghost text-sm">
                  Read the Privacy Policy <ArrowRight size={14} />
                </Link>
                <Link to="/terms" className="btn-ghost text-sm">
                  Read the Terms <ArrowRight size={14} />
                </Link>
              </div>
            </div>
            <div className="hidden lg:flex items-center justify-center">
              <Logo size="lg" />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-20 text-center">
          <p className="eyebrow">Be part of it</p>
          <h2 className="font-serif text-3xl sm:text-4xl mt-5">
            One quiet step into a global congregation.
          </h2>
          <p className="mt-4 text-base sm:text-lg" style={{ color: 'var(--color-text-secondary)' }}>
            Whether you carry a prayer or you carry others in prayer, there is space for you here.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/signup" className="btn-primary">
              Begin Your Prayer Journey <ArrowRight size={16} />
            </Link>
            <Link to="/partner/signup" className="btn-ghost">
              Join as a prayer partner
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
