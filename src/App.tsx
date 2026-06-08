import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { AppUser } from './types';
import DriverApp from './components/DriverApp';
import OperationsApp from './components/OperationsApp';
import {
  Truck,
  Layers,
  Settings,
  HelpCircle,
  Smartphone,
  Monitor,
  CheckCircle,
  ArrowRight,
  Database,
  Users
} from 'lucide-react';

export default function App() {
  const [activePortal, setActivePortal] = useState<'driver' | 'operations'>('operations');
  const [currentDriver, setCurrentDriver] = useState<AppUser | null>(null);

  // Advanced Visual Themes (Light, Emerald, Cosmic Dark)
  const [theme, setTheme] = useState<'light' | 'emerald' | 'dark'>(() => {
    return (localStorage.getItem('dnk_theme') as any) || 'light';
  });

  const changeTheme = (newTheme: 'light' | 'emerald' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('dnk_theme', newTheme);
  };

  // Synchronise global body themes
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('emerald');
    } else if (theme === 'emerald') {
      root.classList.add('emerald');
      root.classList.remove('dark');
    } else {
      root.classList.remove('dark');
      root.classList.remove('emerald');
    }
  }, [theme]);

  // Initialize and retrieve driver session from localStorage if cached
  useEffect(() => {
    const cached = localStorage.getItem('dnk_driver_user');
    if (cached) {
      try {
        setCurrentDriver(JSON.parse(cached));
      } catch (err) {
        console.error("Cache read failed", err);
      }
    }
  }, []);

  const handleDriverLogin = (user: AppUser) => {
    setCurrentDriver(user);
    localStorage.setItem('dnk_driver_user', JSON.stringify(user));
  };

  const handleDriverLogout = () => {
    setCurrentDriver(null);
    localStorage.removeItem('dnk_driver_user');
  };

  return (
    <div className={`min-h-screen transition-all duration-300 flex flex-col justify-between font-sans selection:bg-indigo-600 selection:text-white ${
      theme === 'dark'
        ? 'bg-[#0f172a] text-slate-100'
        : theme === 'emerald'
          ? 'bg-[#f0f4f1] text-[#1e291f]'
          : 'bg-slate-50/50 text-slate-800'
    }`}>
      {/* PREMIUM MINIMALIST NAVIGATION HEADER */}
      <header className={`sticky top-0 z-55 backdrop-blur-md border-b transition-all duration-300 ${
        theme === 'dark'
          ? 'bg-slate-900/90 border-slate-800 text-white'
          : theme === 'emerald'
            ? 'bg-white/90 border-emerald-100 text-[#1e3a1f]'
            : 'bg-white/80 border-slate-100 text-slate-800'
      }`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col xl:flex-row items-center justify-between gap-4">
          
          {/* Logo Brand Segment */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-650 rounded-xl flex items-center justify-center font-bold text-white shadow-md shadow-indigo-600/15">
              <Truck className="w-5 h-5 text-indigo-50" />
            </div>
            <div className="text-left">
              <span className="text-xs font-black tracking-widest text-indigo-600 uppercase font-mono block">DNK Logistics</span>
              <h1 className={`text-base font-bold tracking-tight ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>Driver & Fleet Operations Desk</h1>
            </div>
          </div>

          {/* Theme / Aspect Switcher */}
          <div className={`flex items-center gap-1.5 p-1 rounded-2xl border transition-all ${
            theme === 'dark'
              ? 'bg-slate-950 border-slate-800'
              : theme === 'emerald'
                ? 'bg-[#e2ebe4] border-[#cbdccf]'
                : 'bg-slate-100 border-slate-200/60'
          }`}>
            <span className={`text-[10px] uppercase font-bold font-mono px-2 hidden lg:inline ${
              theme === 'dark' ? 'text-slate-400' : 'text-slate-550'
            }`}>
              Style Opts:
            </span>
            <button
              onClick={() => changeTheme('light')}
              className={`px-3.5 py-1.5 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer ${
                theme === 'light'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/40'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              ❄️ Light Alpine
            </button>
            <button
              onClick={() => changeTheme('emerald')}
              className={`px-3.5 py-1.5 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer ${
                theme === 'emerald'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-905'
              }`}
            >
              🍃 Emerald Biz
            </button>
            <button
              onClick={() => changeTheme('dark')}
              className={`px-3.5 py-1.5 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer ${
                theme === 'dark'
                  ? 'bg-slate-800 text-indigo-450 shadow-sm border border-slate-700/50'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              🌌 Obsidian Night
            </button>
          </div>

          {/* Elegant Portal Switcher HUD */}
          <div className={`flex p-1 rounded-2xl border ${
            theme === 'dark'
              ? 'bg-slate-950 border-slate-800'
              : theme === 'emerald'
                ? 'bg-[#e2ebe4] border-[#cbdccf]'
                : 'bg-slate-100 border-slate-200/55 shadow-inner'
          }`}>
            <button
              onClick={() => setActivePortal('operations')}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                activePortal === 'operations'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/40 font-bold'
                  : theme === 'dark' 
                    ? 'text-slate-400 hover:text-white hover:bg-slate-900/45'
                    : 'text-slate-505 hover:text-slate-900 hover:bg-white/40'
              }`}
            >
              <Monitor className="w-4 h-4 text-slate-500" />
              <span>Operations Board</span>
            </button>
            <button
              onClick={() => setActivePortal('driver')}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold tracking-tight transition-all cursor-pointer ${
                activePortal === 'driver'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10 font-bold'
                  : theme === 'dark'
                    ? 'text-slate-400 hover:text-white hover:bg-slate-900/45'
                    : 'text-slate-505 hover:text-slate-900 hover:bg-white/40'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>Driver Smart Portal</span>
            </button>
          </div>
        </div>
      </header>

      {/* COMPACT & POLISHED SYSTEM GUIDE RIBBON */}
      <section className="max-w-7xl mx-auto px-6 mt-6 w-full text-left">
        <div className="bg-gradient-to-r from-indigo-50/50 to-slate-50 border border-indigo-100/60 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white rounded-xl shadow-sm border border-indigo-100/45">
              <HelpCircle className="w-4.5 h-4.5 text-indigo-600 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-indigo-100/80 font-bold text-indigo-700 font-mono px-2 py-0.5 rounded uppercase">Bilingual</span>
                <h4 className="text-xs font-extrabold text-slate-800 tracking-tight">त्वरित निर्देश (Guided Setup Sandbox)</h4>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 max-w-2xl leading-normal">
                All changes sync in real-time across devices. Try the complete driver workflow by seeding demo data:
              </p>
              
              {/* Process line layout steps */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 mt-3 text-[10px] font-bold text-slate-600">
                <span className="flex items-center gap-1.5 bg-white/70 hover:bg-white px-2 py-1 rounded-lg border border-slate-100 transition-all">
                  <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[9px] flex items-center justify-center font-black">1</span>
                  <span>Click <strong className="text-slate-900">Seed Demo Data</strong> in Operations Board</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 hidden sm:inline" />
                <span className="flex items-center gap-1.5 bg-white/70 hover:bg-white px-2 py-1 rounded-lg border border-slate-100 transition-all">
                  <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 text-[9px] flex items-center justify-center font-black">2</span>
                  <span>Log in on Driver Portal with <strong className="text-indigo-700 font-mono">9999900002</strong></span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 hidden sm:inline" />
                <span className="flex items-center gap-1.5 bg-white/70 hover:bg-white px-2 py-1 rounded-lg border border-slate-100 transition-all">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[9px] flex items-center justify-center font-black">3</span>
                  <span>Inspect, Load truck, report delays, or sign the digital POD receipt</span>
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-[10px] bg-white px-4 py-2 rounded-xl text-slate-500 border border-slate-100 shadow-sm font-mono self-stretch lg:self-auto justify-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 relative flex">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            </span>
            <span className="text-slate-700 font-bold">PERSISTENT SYNC ON</span>
          </div>
        </div>
      </section>

      {/* CORE FRAME LAYOUT */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-6 w-full flex items-start justify-center">
        {activePortal === 'driver' ? (
          <div className="w-full flex-grow flex flex-col items-center justify-center animate-fade-in">
            {/* Smartphone preview framing wrapper with elegant simulated physical shadow */}
            <div className="w-full max-w-md py-4">
              <DriverApp
                currentUser={currentDriver}
                onLoginSuccess={handleDriverLogin}
                onLogout={handleDriverLogout}
              />
            </div>
          </div>
        ) : (
          <div className="w-full animate-fade-in">
            <OperationsApp />
          </div>
        )}
      </main>

      {/* METICULOUS FOOTER DESIGN */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 text-xs py-10 mt-16">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-left space-y-1">
            <p className="font-extrabold text-slate-200">DNK Fleet Logistics Limited &copy; 2026</p>
            <p className="text-[10px] text-slate-500 max-w-md leading-normal">
              Digital Fleet Ecosystem. Built with secure biometric simulation, compressed proof of delivery processing, and real-time offline-tolerant synchronization.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-400 bg-slate-950 px-3.5 py-2 border border-slate-800/80 rounded-xl font-mono">
              Role Auth: Sandbox Authentication
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
