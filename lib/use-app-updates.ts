'use client';

import { useEffect, useRef, useState } from 'react';
import { createAppUpdateCoordinator, UPDATE_CHECK_MS } from './app-updates.ts';

export function useAppUpdates({ ready, busy, checkpoint }: { ready: boolean; busy: boolean; checkpoint: () => boolean }) {
  const [updateReady, setUpdateReady] = useState(false);
  const latest = useRef({ ready, busy, checkpoint });
  useEffect(() => { latest.current = { ready, busy, checkpoint }; });
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    const serviceWorker = navigator.serviceWorker;
    let registration: ServiceWorkerRegistration | undefined;
    let disposed = false;
    const updates = createAppUpdateCoordinator({
      runningVersion: process.env.NEXT_PUBLIC_APP_BUILD ?? 'development',
      now: Date.now,
      visible: () => document.visibilityState === 'visible',
      check: () => {
        // Neither operation is awaited by startup or the drive timer.
        if (navigator.onLine) void registration?.update().catch(() => undefined);
        serviceWorker.controller?.postMessage({ type: 'CHECK_APP_UPDATE' });
      },
      canReload: () => latest.current.ready && !latest.current.busy
        && !document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')
        && !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]'),
      checkpoint: () => latest.current.checkpoint(),
      reload: version => {
        // If a browser unexpectedly serves the old page again, do not loop.
        const attempt = `${process.env.NEXT_PUBLIC_APP_BUILD}:${version}`;
        try {
          if (sessionStorage.getItem('permit-hours-update-attempt') === attempt) return;
          sessionStorage.setItem('permit-hours-update-attempt', attempt);
        } catch { return; }
        window.location.reload();
      },
      onReady: setUpdateReady,
    });
    const message = (event: MessageEvent) => {
      if (event.source === serviceWorker.controller) updates.receive(event.data);
    };
    const resume = () => { updates.interact(); updates.check(); };
    const controllerChanged = () => updates.check(true);
    const interaction = () => updates.interact();
    serviceWorker.addEventListener('message', message);
    serviceWorker.addEventListener('controllerchange', controllerChanged);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('online', resume);
    window.addEventListener('pointerdown', interaction, true);
    window.addEventListener('keydown', interaction, true);
    const checkTimer = window.setInterval(() => updates.check(), UPDATE_CHECK_MS);
    const applyTimer = window.setInterval(() => updates.apply(), 1000);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    void serviceWorker.register(`${base}/sw.js`, { updateViaCache: 'none' }).then(value => {
      if (disposed) return;
      registration = value;
      updates.check(true);
    }).catch(() => undefined);
    return () => {
      disposed = true;
      serviceWorker.removeEventListener('message', message);
      serviceWorker.removeEventListener('controllerchange', controllerChanged);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('pointerdown', interaction, true);
      window.removeEventListener('keydown', interaction, true);
      window.clearInterval(checkTimer);
      window.clearInterval(applyTimer);
    };
  }, []);
  return updateReady;
}
