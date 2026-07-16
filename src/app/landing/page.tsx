'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

const FEATURES = [
  { icon: '💬', title: 'Chat Intelligent', desc: 'Assistant IA contextuel avec mémoire longue' },
  { icon: '🎤', title: 'Voice AI', desc: 'Reconnaissance vocale et synthèse en temps réel' },
  { icon: '📄', title: 'Générateur de Documents', desc: 'Créez des rapports, CV et plus en un clic' },
  { icon: '🏆', title: 'Gamification', desc: 'Gagnez des badges et XP en utilisant la plateforme' },
  { icon: '📱', title: 'Application Mobile', desc: 'Disponible sur iOS et Android' },
  { icon: '🔗', title: 'Intégrations', desc: 'Slack, Discord et plus à venir' },
];

const PRICING = [
  { name: 'Starter', price: 'Gratuit', features: ['100 messages/mois', 'Assistant IA', '1 projet'], cta: 'Commencer' },
  { name: 'Pro', price: '9,99 €', period: '/mois', features: ['Messages illimités', 'Voice AI', 'Documents', 'Badges'], cta: 'Essayer', popular: true },
  { name: 'Enterprise', price: 'Sur mesure', features: ['SSO', 'Support prioritaire', 'API dédiée', 'SLA 99.9%'], cta: 'Nous contacter' },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Navbar */}
      <nav className={`fixed w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/90 backdrop-blur-md shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-2">
              <span className="text-2xl">🧬</span>
              <span className="text-xl font-bold text-gray-900">Genova</span>
            </div>
            <div className="hidden md:flex space-x-8">
              <a href="#features" className="text-gray-600 hover:text-indigo-600 transition">Fonctionnalités</a>
              <a href="#pricing" className="text-gray-600 hover:text-indigo-600 transition">Tarifs</a>
              <a href="#contact" className="text-gray-600 hover:text-indigo-600 transition">Contact</a>
            </div>
            <div className="hidden md:flex space-x-4">
              <Link href="/auth/login" className="px-5 py-2 text-gray-700 hover:text-indigo-600 transition">Connexion</Link>
              <Link href="/auth/register" className="px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">Essai gratuit</Link>
            </div>
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden text-2xl">☰</button>
          </div>
        </div>
        {menuOpen && (
          <div className="md:hidden bg-white border-t px-4 py-4 space-y-3">
            <a href="#features" className="block text-gray-600" onClick={() => setMenuOpen(false)}>Fonctionnalités</a>
            <a href="#pricing" className="block text-gray-600" onClick={() => setMenuOpen(false)}>Tarifs</a>
            <a href="#contact" className="block text-gray-600" onClick={() => setMenuOpen(false)}>Contact</a>
            <Link href="/auth/login" className="block text-gray-700">Connexion</Link>
            <Link href="/auth/register" className="block text-center bg-indigo-600 text-white rounded-xl py-2">Essai gratuit</Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-block bg-indigo-100 text-indigo-600 px-4 py-1 rounded-full text-sm font-medium mb-6">
            🚀 Lancé en 2024
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 leading-tight mb-6">
            Ton assistant IA<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-600">tout-en-un</span>
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10">
            Chat intelligent, reconnaissance vocale, génération de documents et gamification.
            Genova transforme ta productivité.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/auth/register" className="px-8 py-4 bg-indigo-600 text-white rounded-2xl text-lg font-semibold hover:bg-indigo-700 transition shadow-xl shadow-indigo-200">
              Commencer gratuitement
            </Link>
            <a href="#features" className="px-8 py-4 border border-gray-200 text-gray-700 rounded-2xl text-lg font-semibold hover:border-gray-300 transition">
              En savoir plus
            </a>
          </div>
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto text-center">
            <div><div className="text-3xl font-bold text-gray-900">10K+</div><div className="text-gray-400 text-sm">Utilisateurs</div></div>
            <div><div className="text-3xl font-bold text-gray-900">50K+</div><div className="text-gray-400 text-sm">Messages</div></div>
            <div><div className="text-3xl font-bold text-gray-900">99%</div><div className="text-gray-400 text-sm">Satisfaction</div></div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-4">
            Tout ce dont tu as besoin
          </h2>
          <p className="text-gray-500 text-center mb-12 max-w-xl mx-auto">
            Une plateforme complète pour booster ta productivité au quotidien
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div key={i} className="group p-6 rounded-2xl border border-gray-100 hover:border-indigo-100 hover:shadow-lg hover:shadow-indigo-50 transition-all">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-4">
            Des offres pour tous
          </h2>
          <p className="text-gray-500 text-center mb-12">Commence gratuitement, passe à la vitesse supérieure quand tu veux</p>
          <div className="grid md:grid-cols-3 gap-6">
            {PRICING.map((plan, i) => (
              <div key={i} className={`rounded-2xl p-8 ${plan.popular ? 'bg-indigo-600 text-white ring-4 ring-indigo-200 scale-105' : 'bg-white border border-gray-100'}`}>
                <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                {plan.popular && <span className="text-xs bg-white/20 px-2 py-1 rounded-full">🍿 Le plus populaire</span>}
                <div className="mt-4 mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period && <span className="text-sm opacity-80">{plan.period}</span>}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2">
                      <span>✅</span> {f}
                    </li>
                  ))}
                </ul>
                <button className={`w-full py-3 rounded-xl font-semibold transition ${plan.popular ? 'bg-white text-indigo-600 hover:bg-gray-100' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="contact" className="py-20 bg-gradient-to-r from-indigo-600 to-purple-600">
        <div className="max-w-3xl mx-auto text-center px-4">
          <h2 className="text-4xl font-bold text-white mb-4">Prêt à révolutionner ta productivité ?</h2>
          <p className="text-indigo-100 mb-8 text-lg">Rejoins des milliers d'utilisateurs qui utilisent déjà Genova au quotidien.</p>
          <Link href="/auth/register" className="inline-block px-10 py-4 bg-white text-indigo-600 rounded-2xl text-lg font-semibold hover:bg-gray-100 transition shadow-xl">
            Commencer gratuitement 🚀
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <span className="text-2xl">🧬</span>
              <span className="text-white font-bold text-lg">Genova</span>
            </div>
            <p className="text-sm">Assistant IA nouvelle génération</p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Produit</h4>
            <div className="space-y-2 text-sm"><p>Fonctionnalités</p><p>Tarifs</p><p>API</p></div>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Entreprise</h4>
            <div className="space-y-2 text-sm"><p>Blog</p><p>Nous contacter</p><p>Carrières</p></div>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Légal</h4>
            <div className="space-y-2 text-sm"><p>Confidentialité</p><p>CGU</p><p>Cookies</p></div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto border-t border-gray-800 mt-8 pt-8 text-center text-sm">
          © 2024 Genova. Tous droits réservés.
        </div>
      </footer>
    </div>
  );
}
