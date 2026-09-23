import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Staff } from "@prisma/client";

const ROLE_LABEL: Record<Staff["role"], string> = {
  SUPER_ADMIN: "Super Admin",
  DOKTER: "Dokter",
  TERAPIS: "Terapis",
  RESEPSIONIS: "Resepsionis",
};

export function StaffTable({ staff }: { staff: Staff[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nama</TableHead>
          <TableHead>Peran</TableHead>
          <TableHead>Tampil di situs</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {staff.map((person) => (
          <TableRow key={person.id}>
            <TableCell className="font-medium">{person.name}</TableCell>
            <TableCell>{ROLE_LABEL[person.role]}</TableCell>
            <TableCell>{person.showOnWebsite ? "Ya" : "Tidak"}</TableCell>
            <TableCell>
              <Badge variant={person.isActive ? "default" : "secondary"}>
                {person.isActive ? "Aktif" : "Nonaktif"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
