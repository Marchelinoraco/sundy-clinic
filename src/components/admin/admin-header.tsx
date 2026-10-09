"use client";

import MenuIcon from "@mui/icons-material/Menu";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { ColorModeToggle } from "./mui/color-mode-toggle";
import { useAdminNav } from "./mui/admin-shell";

/**
 * Bilah atas setiap halaman admin. Judul besar halaman ada di PageHeader (spec D 3.2), jadi judul di sini
 * bukan <h1> — kecuali halaman tanpa PageHeader (Kunjungan) yang memintanya. Berisi tombol menu (ponsel),
 * tombol mode tampilan, dan menu pengguna (spec MUI 4).
 */
export function AdminHeader({ title, heading = false }: { title: string; heading?: boolean }) {
  const { openNav, userMenu } = useAdminNav();
  return (
    <AppBar position="sticky" className="print:hidden" sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.default" }}>
      <Toolbar variant="dense" sx={{ gap: 1, minHeight: 56 }}>
        <IconButton edge="start" aria-label="Buka menu" onClick={openNav} sx={{ display: { md: "none" } }}>
          <MenuIcon />
        </IconButton>
        <Typography component={heading ? "h1" : "span"} variant="body2" sx={{ fontWeight: 600, flexGrow: 1 }}>
          {title}
        </Typography>
        <ColorModeToggle />
        {/* Dibungkus: elemen dari layout server bukan bagian daftar anak Toolbar (peringatan key React). */}
        {userMenu && <Box sx={{ display: "flex" }}>{userMenu}</Box>}
      </Toolbar>
    </AppBar>
  );
}
