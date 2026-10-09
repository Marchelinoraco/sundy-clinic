"use client";

import MoreHoriz from "@mui/icons-material/MoreHoriz";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { roleCanHaveLogin } from "@/lib/staff-accounts";
import { STAFF_ROLE_LABEL } from "@/lib/staff-role";
import { resetStaffPassword, setStaffActive, type Credentials, type StaffRow } from "@/server/staff";
import { AdminDataGrid } from "../mui/admin-data-grid";
import { StatusChip } from "../mui/status-chip";
import { SectionCard } from "../page-layout";
import { StaffConfirmDialog } from "./staff-confirm-dialog";
import { StaffEmailDialog } from "./staff-email-dialog";
import { StaffFormDialog } from "./staff-form-dialog";
import { TempPasswordDialog } from "./temp-password-dialog";

const MENU_ID = "menu-aksi-staf";

type Dialog =
  | { kind: "add" }
  | { kind: "edit"; row: StaffRow }
  | { kind: "account"; row: StaffRow }
  | { kind: "email"; row: StaffRow }
  | { kind: "deactivate"; row: StaffRow }
  | { kind: "reset"; row: StaffRow };

/** Daftar staf dan seluruh aksi pengelolaannya (spec kelola staf 5.1). */
export function StaffManager({ rows, currentStaffId }: { rows: StaffRow[]; currentStaffId: string }) {
  const router = useRouter();
  const [menu, setMenu] = useState<{ anchor: HTMLElement; row: StaffRow } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [temp, setTemp] = useState<{ name: string; credentials: Credentials; selfReset: boolean } | null>(null);

  function open(next: Dialog) {
    setMenu(null);
    setDialog(next);
  }
  function showCredentials(name: string, credentials: Credentials, selfReset = false) {
    setDialog(null);
    setTemp({ name, credentials, selfReset });
  }
  function closeTemp() {
    const selfReset = temp?.selfReset ?? false;
    setTemp(null);
    // Mereset akun sendiri mencabut sesi ini: pindah ke /masuk hanya setelah kata sandi sempat disalin.
    if (selfReset) router.push("/masuk");
    router.refresh();
  }
  async function activate(row: StaffRow) {
    setMenu(null);
    try {
      const result = await setStaffActive(row.id, true);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${row.name} diaktifkan.`);
      router.refresh();
    } catch {
      toast.error("Aksi gagal. Coba lagi.");
    }
  }

  const columns: GridColDef<StaffRow>[] = [
    { field: "name", headerName: "Nama", flex: 1, minWidth: 180, renderCell: ({ row }) => <Typography sx={{ fontWeight: 500, fontSize: "inherit" }}>{row.name}</Typography> },
    { field: "role", headerName: "Peran", minWidth: 150, valueGetter: (_value, row) => STAFF_ROLE_LABEL[row.role], renderCell: ({ row }) => <StatusChip label={STAFF_ROLE_LABEL[row.role]} /> },
    {
      field: "email",
      headerName: "Akun",
      flex: 1.2,
      minWidth: 230,
      valueGetter: (_value, row) => row.email ?? "Belum punya akun",
      renderCell: ({ row }) => (
        <Box sx={{ py: 0.5, minWidth: 0 }}>
          {row.email ? <Box sx={{ overflowWrap: "anywhere" }}>{row.email}</Box> : <Box sx={{ color: "text.secondary" }}>Belum punya akun</Box>}
        </Box>
      ),
    },
    {
      field: "isActive",
      headerName: "Status",
      minWidth: 170,
      valueGetter: (_value, row) => (row.isActive ? "Aktif" : "Nonaktif"),
      renderCell: ({ row }) => (
        <Box sx={{ py: 0.5, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0.5 }}>
          <StatusChip label={row.isActive ? "Aktif" : "Nonaktif"} tone={row.isActive ? "success" : "neutral"} />
          {row.mustChangePassword && <StatusChip label="Wajib ganti kata sandi" tone="warning" />}
        </Box>
      ),
    },
    {
      field: "actions",
      headerName: "Aksi",
      width: 80,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: ({ row }) => (
        <IconButton
          size="small"
          aria-label={`Aksi lain ${row.name}`}
          aria-haspopup="menu"
          aria-expanded={menu?.row.id === row.id}
          aria-controls={menu?.row.id === row.id ? MENU_ID : undefined}
          onClick={(event) => setMenu({ anchor: event.currentTarget, row })}
        >
          <MoreHoriz fontSize="small" />
        </IconButton>
      ),
    },
  ];

  const target = menu?.row;
  const self = target?.id === currentStaffId;

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="contained" onClick={() => open({ kind: "add" })}>
          + Tambah staf
        </Button>
      </Box>
      <SectionCard title="Daftar staf" flush>
        <AdminDataGrid rows={rows} columns={columns} label="Daftar staf" emptyText="Belum ada staf." />
      </SectionCard>

      <Menu id={MENU_ID} anchorEl={menu?.anchor ?? null} open={menu !== null} onClose={() => setMenu(null)} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        {target && <MenuItem onClick={() => open({ kind: "edit", row: target })}>Ubah</MenuItem>}
        {target && !target.email && roleCanHaveLogin(target.role) && target.isActive && <MenuItem onClick={() => open({ kind: "account", row: target })}>Buat akun</MenuItem>}
        {target?.email && <MenuItem onClick={() => open({ kind: "reset", row: target })}>Reset kata sandi</MenuItem>}
        {target?.email && <MenuItem onClick={() => open({ kind: "email", row: target })}>Ganti email</MenuItem>}
        {target && target.isActive && !self && (
          <MenuItem sx={{ color: "error.main" }} onClick={() => open({ kind: "deactivate", row: target })}>
            Nonaktifkan
          </MenuItem>
        )}
        {target && !target.isActive && <MenuItem onClick={() => void activate(target)}>Aktifkan</MenuItem>}
      </Menu>

      {dialog?.kind === "add" && <StaffFormDialog mode="add" onClose={() => setDialog(null)} onCredentials={showCredentials} />}
      {dialog?.kind === "edit" && <StaffFormDialog key={dialog.row.id} mode="edit" row={dialog.row} onClose={() => setDialog(null)} onCredentials={showCredentials} />}
      {dialog?.kind === "account" && <StaffEmailDialog key={dialog.row.id} mode="create" row={dialog.row} onClose={() => setDialog(null)} onCredentials={showCredentials} />}
      {dialog?.kind === "email" && <StaffEmailDialog key={dialog.row.id} mode="change" row={dialog.row} isSelf={dialog.row.id === currentStaffId} onClose={() => setDialog(null)} onCredentials={showCredentials} />}
      {dialog?.kind === "deactivate" && (
        <StaffConfirmDialog
          title={`Nonaktifkan ${dialog.row.name}?`}
          description="Staf langsung keluar dari semua perangkat dan tidak bisa masuk lagi sampai diaktifkan kembali. Riwayat kerjanya tetap utuh."
          confirmLabel="Nonaktifkan"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const result = await setStaffActive(dialog.row.id, false);
            if (result.ok) {
              toast.success(`${dialog.row.name} dinonaktifkan.`);
              router.refresh();
            }
            return result;
          }}
        />
      )}
      {dialog?.kind === "reset" && (
        <StaffConfirmDialog
          title={`Reset kata sandi ${dialog.row.name}?`}
          description={
            dialog.row.id === currentStaffId
              ? "Anda akan keluar dari semua perangkat dan harus membuat kata sandi baru saat masuk lagi. Kata sandi sementara tampil sekali di layar ini; salin dulu sebelum menutupnya."
              : "Kata sandi lama berhenti berlaku dan staf keluar dari semua perangkat. Anda akan mendapat kata sandi sementara untuk disampaikan ke staf."
          }
          confirmLabel="Reset kata sandi"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            const result = await resetStaffPassword(dialog.row.id);
            if (result.ok) showCredentials(dialog.row.name, result.data.credentials, dialog.row.id === currentStaffId);
            return result;
          }}
        />
      )}
      {temp && <TempPasswordDialog name={temp.name} credentials={temp.credentials} requireConfirm={temp.selfReset} onClose={closeTemp} />}
    </Stack>
  );
}
