"use client";

import { usePathname } from "next/navigation";
import { NavBar } from "./NavBar";

// Marketing routes render their own chrome (LandingNav), so the app NavBar is
// hidden there. Everything else (the product: chat, playground, models, …)
// gets the standard app NavBar.
const MARKETING_ROUTES = ["/", "/docs", "/login", "/signup"];

export function SiteChrome() {
  const pathname = usePathname() || "/";
  const isMarketing = MARKETING_ROUTES.includes(pathname);
  if (isMarketing) return null;
  return <NavBar />;
}
