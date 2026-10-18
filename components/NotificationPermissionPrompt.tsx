"use client";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import { readNotificationPromptChoice, saveNotificationPromptChoice, shouldShowNotificationPrompt } from "@/lib/notification-permission";
import { ensurePushSubscription } from "@/lib/push/browser";
import "@/app/styles/notification-permission.css";

export function NotificationPermissionPrompt({ userId }: { userId: string }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const syncGranted = useCallback(async () => {
    setBusy(true);
    try {
      await ensurePushSubscription();
      saveNotificationPromptChoice(userId, "granted");
      setMessage(en ? "Notifications enabled on this device." : "Notifications activées sur cet appareil");
      setVisible(false);
    } catch {
      setMessage(en ? "Permission is granted, but notifications could not be registered. Check your connection and try again." : "L’autorisation est accordée, mais l’inscription aux notifications a échoué. Vérifiez votre connexion et réessayez.");
      setVisible(false);
    } finally { setBusy(false); }
  }, [userId, en]);
  useEffect(() => {
    let alive = true;
    setMessage(null); setVisible(false); setHint(false);
    if (!userId) return () => { alive = false; };
    const notificationApi = typeof window.Notification !== "undefined" && typeof window.Notification.requestPermission === "function";
    const supported = notificationApi && "serviceWorker" in navigator && "PushManager" in window && window.isSecureContext === true;
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone = (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const permission = notificationApi ? window.Notification.permission : null;
    const savedChoice = readNotificationPromptChoice(userId);
    if (isIos && !isStandalone && (permission === "default" || !notificationApi) && !savedChoice) setHint(true);
    if (permission === "granted") {
      void ensurePushSubscription().then(() => {
        if (!alive) return;
        saveNotificationPromptChoice(userId, "granted");
        // Already-authorized devices enroll silently; do not show a banner on every visit.
      }).catch(() => {
        if (alive) setMessage(en ? "Permission is granted, but notifications could not be registered. Check your connection and try again." : "L’autorisation est accordée, mais l’inscription aux notifications a échoué. Vérifiez votre connexion et réessayez.");
      });
      return () => { alive = false; };
    }
    setVisible(shouldShowNotificationPrompt({ supported, secureContext: window.isSecureContext === true, permission, savedChoice, isIos, isStandalone }));
    return () => { alive = false; };
  }, [userId, en]);
  function defer() { saveNotificationPromptChoice(userId, "deferred"); setVisible(false); setHint(false); setMessage(null); }
  async function activate() {
    if (busy) return;
    setBusy(true);
    saveNotificationPromptChoice(userId, "requested");
    try {
      // Keep this call synchronous with the user's click; do not await before it.
      const permissionPromise = window.Notification.requestPermission();
      const permission = await permissionPromise;
      saveNotificationPromptChoice(userId, permission === "default" ? "dismissed" : permission);
      if (permission === "granted") {
        await ensurePushSubscription();
        saveNotificationPromptChoice(userId, "granted");
        setMessage(en ? "Notifications enabled on this device." : "Notifications activées sur cet appareil");
        setVisible(false);
      } else if (permission === "denied") {
        setMessage(en ? "Your choice is saved. You can change it in your browser settings." : "Votre choix est enregistré. Vous pouvez le modifier dans les réglages du navigateur.");
        setVisible(false);
      } else { setVisible(false); setMessage(null); }
    } catch {
      setMessage(en ? "Notifications could not be registered. Check your connection and try again." : "L’inscription aux notifications a échoué. Vérifiez votre connexion et réessayez.");
      setVisible(window.Notification.permission === "granted");
    } finally { setBusy(false); }
  }
  if (!visible && !message && !hint) return null;
  return <aside className="notification-permission-prompt" aria-label={en ? "Enable notifications" : "Activation des notifications"}>
    <div className="notification-permission-icon"><Bell size={21} aria-hidden="true" /></div>
    <div className="notification-permission-content">
      {hint && !visible && !message ? <><p role="status">{en ? "To enable notifications on iPhone or iPad, add this app to your Home Screen first." : "Pour activer les notifications sur iPhone ou iPad, ajoutez d’abord cette app à l’écran d’accueil."}</p><button type="button" className="notification-permission-later" onClick={defer}>{en ? "Later" : "Plus tard"}</button></> : message ? <><p role="status">{message}</p>{window.Notification?.permission !== "denied" && message !== (en ? "Notifications enabled on this device." : "Notifications activées sur cet appareil") ? <button type="button" className="notification-permission-enable" onClick={() => void (window.Notification?.permission === "granted" ? syncGranted() : activate())} disabled={busy}>{busy ? (en ? "Retrying…" : "Nouvel essai…") : (en ? "Retry" : "Réessayer")}</button> : null}<button type="button" className="notification-permission-later" onClick={() => { setMessage(null); setHint(false); }}>{en ? "Close" : "Fermer"}</button></> : <>
        <h2>{en ? "Enable Vendeo notifications?" : "Activer les notifications Vendeo ?"}</h2>
        <p>{en ? "Allow Vendeo to display notifications on this device. Your browser will ask you to confirm." : "Autorisez Vendeo à afficher des notifications sur cet appareil. Votre navigateur vous demandera de confirmer."}</p>
        <div className="notification-permission-actions"><button type="button" className="notification-permission-enable" onClick={() => void activate()} disabled={busy}>{busy ? (en ? "Enabling…" : "Activation…") : (en ? "Enable" : "Activer")}</button><button type="button" className="notification-permission-later" onClick={defer} disabled={busy}>{en ? "Later" : "Plus tard"}</button></div>
        <small>{en ? "Your choice is remembered for 7 days. No repeated permission requests." : "Votre choix est mémorisé pendant 7 jours, sans demande répétée."}</small>
      </>}
    </div>
  </aside>;
}
