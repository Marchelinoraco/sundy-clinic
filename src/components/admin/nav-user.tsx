"use client";

import Logout from "@mui/icons-material/Logout";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";
import { STAFF_ROLE_LABEL } from "@/lib/staff-role";
import type { CurrentStaff } from "@/server/session";

/** Menu pengguna di bilah atas (spec MUI 4): inisial, lalu nama, peran, email, dan Keluar. */
export function NavUser({ staff }: { staff: CurrentStaff }) {
  const router = useRouter();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const initials = staff.name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <>
      <IconButton aria-label={`Menu pengguna ${staff.name}`} aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget)} size="small">
        <Avatar sx={{ width: 32, height: 32, fontSize: "0.8rem", bgcolor: "secondary.main", color: "secondary.contrastText" }}>{initials}</Avatar>
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        <Box sx={{ px: 2, py: 1, maxWidth: 280 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {staff.name}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }} noWrap>
            {STAFF_ROLE_LABEL[staff.role]} · {staff.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          onClick={async () => {
            setAnchor(null);
            await signOut();
            router.push("/masuk");
            router.refresh();
          }}
        >
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          Keluar
        </MenuItem>
      </Menu>
    </>
  );
}
