"use client";

import { useEffect } from "react";
import { trackPendingRegistration } from "@/lib/meta-pixel";

export function MetaRegistrationTracker() {
  useEffect(() => {
    trackPendingRegistration();
  }, []);

  return null;
}
