"use client";

import { useEffect, useRef } from "react";

/**
 * Cierre de sesión por inactividad (protección de datos en equipos compartidos).
 * Cualquier interacción reinicia el contador; se sincroniza entre pestañas.
 */
export function IdleLogout({ minutes, action }: { minutes: number; action: () => Promise<void> }) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const KEY = "tpc-ultima-actividad";
    const limit = minutes * 60 * 1000;
    const touch = () => {
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* almacenamiento no disponible: se usa solo el temporizador de esta pestaña */
      }
      last = Date.now();
    };
    let last = Date.now();
    touch();
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = window.setInterval(() => {
      let shared = last;
      try {
        shared = Math.max(last, Number(localStorage.getItem(KEY) ?? 0));
      } catch {
        /* sin almacenamiento */
      }
      if (Date.now() - shared > limit) formRef.current?.requestSubmit();
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(timer);
    };
  }, [minutes]);
  return (
    <form ref={formRef} action={action} hidden>
      <input type="hidden" name="motivo" value="inactividad" />
    </form>
  );
}
