"use client";

import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import NextLink from "next/link";

export type PageTab = { id: string; label: string; href: string };

/** Tab sebagai tautan (`?tab=`), bukan tab ARIA: setiap tab adalah alamat sendiri (spec D 3.1). */
export function PageTabs({ tabs, active, label }: { tabs: PageTab[]; active: string; label: string }) {
  return (
    <Box component="nav" aria-label={label} sx={{ borderBottom: 1, borderColor: "divider", overflowX: "auto" }}>
      <Box component="ul" sx={{ display: "flex", gap: 3, listStyle: "none", m: 0, p: 0 }}>
        {tabs.map((tab) => {
          const current = tab.id === active;
          return (
            <li key={tab.id}>
              <MuiLink
                component={NextLink}
                href={tab.href}
                aria-current={current ? "page" : undefined}
                underline="none"
                sx={{
                  display: "inline-block",
                  py: 1,
                  mb: "-1px",
                  borderBottom: 2,
                  borderColor: current ? "primary.main" : "transparent",
                  color: current ? "text.primary" : "text.secondary",
                  fontWeight: current ? 600 : 400,
                  fontSize: "0.875rem",
                  whiteSpace: "nowrap",
                  "&:hover": { color: "text.primary" },
                }}
              >
                {tab.label}
              </MuiLink>
            </li>
          );
        })}
      </Box>
    </Box>
  );
}
