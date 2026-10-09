"use client";

import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const NAV_WIDTH = 264;
const AdminNavContext = createContext<{ openNav: () => void; userMenu?: ReactNode }>({ openNav: () => {} });

/** Untuk bilah atas halaman: membuka laci menu di ponsel dan menampilkan menu pengguna. Di luar AdminShell kosong. */
export function useAdminNav() {
  return useContext(AdminNavContext);
}

/**
 * Kerangka admin (spec MUI 4): menu tetap di layar lebar, laci geser di ponsel. Laci ponsel tidak dipasang
 * sampai dibuka, sehingga tautan menu tidak tampil ganda.
 */
export function AdminShell({ sidebar, userMenu, children }: { sidebar: ReactNode; userMenu?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <AdminNavContext.Provider value={{ openNav: () => setOpen(true), userMenu }}>
      <Box sx={{ display: "flex", minHeight: "100svh" }}>
        <Box component="nav" aria-label="Menu admin" className="print:hidden" sx={{ width: { md: NAV_WIDTH }, flexShrink: { md: 0 } }}>
          <Drawer
            variant="temporary"
            open={open}
            onClose={() => setOpen(false)}
            ModalProps={{ keepMounted: false }}
            sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { width: NAV_WIDTH, boxSizing: "border-box" } }}
          >
            {sidebar}
          </Drawer>
          <Drawer
            variant="permanent"
            open
            sx={{ display: { xs: "none", md: "block" }, "& .MuiDrawer-paper": { width: NAV_WIDTH, boxSizing: "border-box" } }}
          >
            {sidebar}
          </Drawer>
        </Box>
        <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
          {children}
        </Box>
      </Box>
    </AdminNavContext.Provider>
  );
}
