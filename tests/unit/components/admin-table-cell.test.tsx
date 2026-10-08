import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderAdmin } from "../helpers/render-admin";

describe("sel tabel admin", () => {
  it("angka rata kanan tidak dipenggal (nominal tetap satu baris), teks boleh turun baris", () => {
    renderAdmin(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Biaya booking (di muka)</TableCell>
            <TableCell align="right">-Rp 3.200.000</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole("cell", { name: "-Rp 3.200.000" })).toHaveStyle({ whiteSpace: "nowrap" });
    expect(screen.getByRole("cell", { name: "Biaya booking (di muka)" })).not.toHaveStyle({ whiteSpace: "nowrap" });
  });
});
