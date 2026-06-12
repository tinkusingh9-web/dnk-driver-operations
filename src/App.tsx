import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { AppUser } from './types';
import DriverApp from './components/DriverApp';
import OperationsApp from './components/OperationsApp';
import {
  Truck,
  Smartphone,
  Monitor
} from 'lucide-react';

const appMode =
  import.meta.env.VITE_APP_MODE ||
  import.meta.env.VITE_MODE ||
  '';
console.log('VITE_APP_MODE', import.meta.env.VITE_APP_MODE);
console.log('VITE_MODE', import.meta.env.VITE_MODE);
console.log('FINAL_APP_MODE', appMode);
const isDriverMode = appMode === 'driver';
const isOperationsMode = appMode === 'operations';
const isDirectMode = isDriverMode || isOperationsMode;

export default function App() {
  const [activePortal, setActivePortal] = useState<'driver' | 'operations'>(() => {
    if (appMode === 'operations') return 'operations';
    return 'driver';
  });
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

  if (isDriverMode) {
    return (
      <DriverApp
        currentUser={currentDriver}
        onLoginSuccess={handleDriverLogin}
        onLogout={handleDriverLogout}
        fullScreen
      />
    );
  }

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
              <span className="text-xs font-black tracking-widest text-indigo-600 uppercase font-mono block">
                {isDriverMode ? 'DNK TRANS LOGISTICS' : 'DNK Logistics'}
              </span>
              <h1 className={`text-base font-bold tracking-tight ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                {isDriverMode ? 'DRIVER PORTAL' : 'Driver & Fleet Operations Desk'}
              </h1>
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
          {!isDirectMode && (
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
          )}
        </div>
      </header>

      {/* CORE FRAME LAYOUT */}
      <main className="flex-grow max-w-7xl mx-auto px-6 py-6 w-full flex items-start justify-center">
        {isOperationsMode ? (
          <div className="w-full animate-fade-in">
            <OperationsApp />
          </div>
        ) : activePortal === 'driver' ? (
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
