"use client";

import { Bell, BellOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { eventHref, eventMessage, freshEvents, LIVE_POLL_MS, nextSince, watchedKinds, type LiveEvent } from "@/lib/live-events";
import type { can } from "@/lib/permissions";

type Role = Parameters<typeof can>[0];
const SOUND_KEY = "sundy-bunyi";

/** Nada pendek dua langkah dengan WebAudio (tanpa berkas suara). */
function beep(context: AudioContext) {
  const now = context.currentTime;
  [880, 1175].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now + index * 0.16);
    gain.gain.setValueAtTime(0.0001, now + index * 0.16);
    gain.gain.exponentialRampToValueAtTime(0.2, now + index * 0.16 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.16 + 0.15);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now + index * 0.16);
    oscillator.stop(now + index * 0.16 + 0.16);
  });
}

/**
 * Pemberitahuan langsung di layar admin (spec pemberitahuan): memeriksa tiap 10 detik selama tab terlihat,
 * memunculkan pop-up dan bunyi untuk peristiwa baru, lalu memuat ulang layar supaya antrean, lencana menu,
 * dan dasbor terbarui. Hanya jalan bila tab admin terbuka; tidak ada notifikasi saat peramban tertutup.
 */
export function LiveNotifier({ initialSince, role }: { initialSince: string; role: Role }) {
  const router = useRouter();
  const enabled = watchedKinds(role).length > 0;
  const [watching, setWatching] = useState(enabled);
  const [soundOn, setSoundOn] = useState(true);
  const soundRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);
  const sinceRef = useRef(initialSince);
  const seenRef = useRef(new Set<string>());
  const busyRef = useRef(false);

  useEffect(() => {
    try {
      const off = localStorage.getItem(SOUND_KEY) === "mati";
      setSoundOn(!off);
      soundRef.current = !off;
    } catch {
      // Penyimpanan peramban bisa tidak tersedia; bunyi tetap hidup untuk sesi ini.
    }
  }, []);

  // Peramban baru mengizinkan bunyi setelah pengguna menyentuh halaman: buat konteks audio pada sentuhan pertama.
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      try {
        audioRef.current ??= new AudioContext();
        void audioRef.current.resume?.();
      } catch {
        audioRef.current = null;
      }
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, [enabled]);

  const poll = useCallback(async () => {
    if (busyRef.current || document.visibilityState === "hidden") return;
    busyRef.current = true;
    try {
      const response = await fetch(`/admin/pemberitahuan?sejak=${encodeURIComponent(sinceRef.current)}`, { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { watching: boolean; serverTime: string; events: LiveEvent[] };
      if (!body.watching) {
        setWatching(false);
        return;
      }
      sinceRef.current = nextSince(body.serverTime);
      const fresh = freshEvents(seenRef.current, body.events);
      if (fresh.length === 0) return;
      for (const event of fresh) {
        const message = eventMessage(event, role);
        toast(message.title, { description: message.description, action: { label: "Buka", onClick: () => router.push(eventHref(event, role)) } });
      }
      if (soundRef.current && audioRef.current) {
        try {
          beep(audioRef.current);
        } catch {
          // Bunyi hanya pelengkap.
        }
      }
      router.refresh();
    } catch {
      // Jaringan putus sesaat: coba lagi pada putaran berikutnya.
    } finally {
      busyRef.current = false;
    }
  }, [role, router]);

  useEffect(() => {
    if (!enabled || !watching) return;
    const timer = setInterval(() => void poll(), LIVE_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, watching, poll]);

  if (!enabled || !watching) return null;

  function toggle() {
    const next = !soundOn;
    setSoundOn(next);
    soundRef.current = next;
    try {
      localStorage.setItem(SOUND_KEY, next ? "hidup" : "mati");
    } catch {
      // Abaikan: pilihan hanya berlaku untuk sesi ini.
    }
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      onClick={toggle}
      aria-label={soundOn ? "Bunyi notifikasi hidup" : "Bunyi notifikasi mati"}
      title={soundOn ? "Bunyi notifikasi hidup (klik untuk mematikan)" : "Bunyi notifikasi mati (klik untuk menyalakan)"}
      className="fixed bottom-4 right-4 z-40 rounded-full shadow-md print:hidden"
    >
      {soundOn ? <Bell /> : <BellOff />}
    </Button>
  );
}
