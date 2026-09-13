'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Zap,
  RotateCcw,
  LayoutDashboard,
  Users,
  Terminal,
  Clock,
  Sparkles,
  Loader2,
  LogOut,
} from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isSeeding, setIsSeeding] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [istTime, setIstTime] = useState<string>('');
  const [isWithinHours, setIsWithinHours] = useState(true);
  const [isVirtual, setIsVirtual] = useState(false);

  useEffect(() => {
    let cancelled = false;

    /**
     * The navbar must read the same clock the agent reads.
     *
     * This used to format `new Date()` in the browser, so advancing the demo clock to 09:30
     * left the pill saying "Outside Contact Hours" while the agent was actively dispatching —
     * the header contradicted the audit trail on the very rule the header exists to show.
     * `/api/simulator/clock` is the server's own clock, virtual offset included.
     */
    const readClock = async () => {
      let now = new Date();
      try {
        const res = await fetch('/api/simulator/clock');
        if (res.ok) {
          const json = await res.json();
          if (json?.data?.nowIso) now = new Date(json.data.nowIso);
          if (!cancelled) setIsVirtual(Boolean(json?.data?.isVirtual));
        }
      } catch {
        // Demo routes are 404 on a non-demo deployment; fall back to real time.
      }
      if (cancelled) return;

      setIstTime(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      );

      const istHours = Number(
        now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false })
      );
      setIsWithinHours(istHours >= 8 && istHours < 19);
    };

    readClock();
    const interval = setInterval(readClock, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch('/api/simulator/seed', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        window.location.reload();
      }
    } catch (err) {
      console.error('Seed error:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleRunAgent = async () => {
    setIsRecovering(true);
    try {
      const res = await fetch('/api/recovery/trigger', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        window.location.reload();
      }
    } catch (err) {
      console.error('Run agent error:', err);
    } finally {
      setIsRecovering(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

  // Short, single-word labels. The former "Customers & Audit" / "Simulator Sandbox" wrapped
  // onto two lines from 1440px down, which pushed the header out of its 64px row.
  const navLinks = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/customers', label: 'Customers', icon: Users },
    { href: '/simulator', label: 'Simulator', icon: Terminal },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center gap-4 lg:gap-6 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight whitespace-nowrap text-zinc-900 dark:text-zinc-50">
                  Recover<span className="text-indigo-600 dark:text-indigo-400">AI</span>
                </span>
                <Badge variant="secondary" className="text-[10px] uppercase font-semibold tracking-wider py-0 px-1.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                  Track 3
                </Badge>
              </div>
              <span className="hidden xl:block text-[11px] text-zinc-500 font-medium whitespace-nowrap">
                Razorpay Revenue Recovery Agent
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-zinc-100 text-zinc-900 font-semibold dark:bg-zinc-800 dark:text-zinc-50'
                      : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500'}`} />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Compliance Status & Quick Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* RBI Contact Hours Pill */}
          <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 text-xs whitespace-nowrap">
            <Clock className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
            <span className="font-mono text-zinc-700 dark:text-zinc-300 font-medium tabular-nums">
              {istTime || '--:--'}
            </span>
            {isVirtual && (
              <span
                className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400"
                title="The demo clock has been advanced; the agent reads this time too."
              >
                Sim
              </span>
            )}
            <span className="text-zinc-300 dark:text-zinc-700">|</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 shrink-0 rounded-full ${
                  isWithinHours ? 'bg-emerald-500 ring-4 ring-emerald-500/20' : 'bg-amber-500'
                }`}
              />
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                {isWithinHours ? 'Contact window open' : 'Outside contact hours'}
              </span>
            </div>
          </div>

          {/* Quick Action: Seed Batch */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSeed}
            disabled={isSeeding || isRecovering}
            className="text-xs font-medium whitespace-nowrap border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800"
          >
            {isSeeding ? (
              <>
                <Loader2 className="w-3.5 h-3.5 sm:mr-1.5 animate-spin" />
                <span className="hidden sm:inline">Seeding...</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5 sm:mr-1.5 text-zinc-600" />
                <span className="hidden sm:inline">Seed batch</span>
              </>
            )}
          </Button>

          {/* Quick Action: Run Recovery Agent */}
          <Button
            size="sm"
            onClick={handleRunAgent}
            disabled={isSeeding || isRecovering}
            className="text-xs font-medium whitespace-nowrap bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20"
          >
            {isRecovering ? (
              <>
                <Loader2 className="w-3.5 h-3.5 sm:mr-1.5 animate-spin" />
                <span className="hidden sm:inline">Running...</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Run agent</span>
              </>
            )}
          </Button>

          {/* Log out of the dashboard session */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-xs font-medium whitespace-nowrap text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            aria-label="Log out"
          >
            <LogOut className="w-3.5 h-3.5 lg:mr-1.5" />
            <span className="hidden lg:inline">Log out</span>
          </Button>
        </div>
      </div>

      {/*
        Below md the primary nav was hidden with no replacement, so a phone could reach the
        dashboard and then had no way to open Customers or the Simulator at all. This is that
        nav, as a scrollable second row.
      */}
      <nav className="lg:hidden flex items-center gap-1 overflow-x-auto px-4 pb-2 -mt-1">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-zinc-100 text-zinc-900 font-semibold dark:bg-zinc-800 dark:text-zinc-50'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500'}`} />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
