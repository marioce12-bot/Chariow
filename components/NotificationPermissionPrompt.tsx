"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import { readNotificationPromptChoice, saveNotificationPromptChoice, shouldShowNotificationPrompt } from "@/lib/notification-permission";
import "@/app/styles/notification-permission.css";

export function NotificationPermissionPrompt({ userId }: { userId: string }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    setMessage(null); setVisible(false);
    if (!userId) return;
    const supported = typeof window.Notification !== "undefined" && typeof window.Notification.requestPermission === "function";
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone = (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setVisible(shouldShowNotificationPrompt({ supported, secureContext: window.isSecureContext === true, permission: supported ? window.Notification.permission : null, savedChoice: readNotificationPromptChoice(userId), isIos, isStandalone }));
  }, [userId]);
  function defer() {
    saveNotificationPromptChoice(userId, "deferred");
    setVisible(false);
  }
  async function activate() {
    if (busy) return;
    setBusy(true);
    saveNotificationPromptChoice(userId, "requested");
    try {
      // Must be called directly from this explicit click, with no awaited work before it.
      const permission = await window.Notification.requestPermission();
      saveNotificationPromptChoice(userId, permission === "default" ? "dismissed" : permission);
      setMessage(permission === "granted"
        ? (en ? "Browser notifications are now allowed on this device." : "Les notifications du navigateur sont autorisées sur cet appareil.")
        : permission === "denied"
          ? (en ? "Your choice is saved. You can change it in your browser settings." : "Votre choix est enregistré. Vous pouvez le modifier dans les réglages du navigateur.")
          : null);
    } catch {
      saveNotificationPromptChoice(userId, "unavailable");
      setMessage(en ? "The browser could not open the permission request. You can manage notifications in its site settings." : "Le navigateur n’a pas pu ouvrir la demande. Vous pouvez gérer les notifications dans ses réglages du site.");
    } finally { setVisible(false); setBusy(false); }
  }
  if (!visible && !message) return null;
  return <aside className="notification-permission-prompt" aria-label={en ? "Enable notifications" : "Activation des notifications"}>
    <div className="notification-permission-icon"><Bell size={21} aria-hidden="true" /></div>
    <div className="notification-permission-content">
      {message ? <><p role="status">{message}</p><button type="button" className="notification-permission-later" onClick={() => setMessage(null)}>{en ? "Close" : "Fermer"}</button></> : <>
        <h2>{en ? "Enable Vendeo notifications?" : "Activer les notifications Vendeo ?"}</h2>
        <p>{en ? "Allow Vendeo to display notifications on this device. Your browser will ask you to confirm." : "Autorisez Vendeo à afficher des notifications sur cet appareil. Votre navigateur vous demandera de confirmer."}</p>
        <div className="notification-permission-actions"><button type="button" className="notification-permission-enable" onClick={() => void activate()} disabled={busy}>{busy ? (en ? "Opening…" : "Ouverture…") : (en ? "Enable" : "Activer")}</button><button type="button" className="notification-permission-later" onClick={defer} disabled={busy}>{en ? "Later" : "Plus tard"}</button></div>
        <small>{en ? "Your choice is remembered. No repeated requests on each visit." : "Votre choix sera mémorisé, sans demande répétée à chaque visite."}</small>
      </>}
    </div>
  </aside>;
}
