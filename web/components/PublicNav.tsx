"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function PublicNav() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/our-doctors", label: "Our Doctors" },
    { href: "/specialities", label: "Specialities" },
    { href: "/services-facilities", label: "Services & facilities" },
    { href: "/events", label: "Events" },
    { href: "/research", label: "Research" },
    { href: "/about-us", label: "About-Us" },
  ];

  const menuItems = [
    { href: "/my-profile", label: "My Profile" },
    { href: "/organ-donation", label: "Organ-donation" },
    { href: "/awards-achievements", label: "Awards & Achievements" },
    { href: "/blogs", label: "Blogs" },
    { href: "/patient-education", label: "Patient-Education" },
    { href: "/mobile-app", label: "Mobile-App" },
    { href: "/gallery", label: "Gallery" },
    { href: "/contact-us", label: "Contact-Us" },
    { href: "/feedback", label: "Feedback" },
    { href: "/emergency", label: "Emergency" },
  ];
  const searchResults = [...navItems, ...menuItems].filter((item) =>
    item.label.toLowerCase().includes(searchQuery.trim().toLowerCase()),
  );

  return (
    <div className="pnav">
      <button
        type="button"
        className="nav-hamburger"
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span />
        <span />
        <span />
      </button>

      <div className="wrap">
        <Link className="logo" href="/"><i>+</i>MediAccess</Link>

        <div className={`links ${menuOpen ? "open" : ""}`}>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
              {item.label}
            </Link>
          ))}
        </div>

        <div className="nav-actions">
          <form
            className="nav-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              if (searchResults[0]) {
                router.push(searchResults[0].href);
                setSearchQuery("");
              }
            }}
          >
            <input
              type="search"
              aria-label="Search pages"
              placeholder="Search pages"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery.trim() && (
              <div className="nav-search-results">
                {searchResults.length ? searchResults.map((item) => (
                  <Link key={item.href} href={item.href} onClick={() => setSearchQuery("")}>
                    {item.label}
                  </Link>
                )) : <p>No matching pages</p>}
              </div>
            )}
          </form>
          <Link href="/staff/login" style={{ fontSize: 13, color: "var(--muted)" }}>Staff login →</Link>
        </div>
      </div>

      <div className={`hamburger-menu ${menuOpen ? "open" : ""}`}>
        {menuItems.map((item) => (
          <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
