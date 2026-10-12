import { formatRupiah } from "./format";
import { formatReceiptDateTime, RECEIPT_STATUS_LABEL, type PublicReceipt } from "./receipt";
import { dateLabel, PAYMENT_METHOD_LABEL } from "./stock";

// Struk untuk printer thermal lewat QZ Tray (spec struk WA 7.1). Murni: hanya membangun teks perintah ESC/POS.

export type PaperWidth = 58 | 80;

export const ESC_INIT = "\x1B@";
const ALIGN_LEFT = "\x1Ba\x00";
const ALIGN_CENTER = "\x1Ba\x01";
const BOLD_ON = "\x1BE\x01";
const BOLD_OFF = "\x1BE\x00";
/** GS V 65 3: maju 3 baris lalu potong sebagian. Printer tanpa pemotong mengabaikannya. */
export const CUT_PAPER = "\x1DVA\x03";

export function receiptColumns(width: PaperWidth): number {
  return width === 58 ? 32 : 48;
}

/** Printer thermal memakai halaman kode terbatas: aksen dibuang, tanda baca khusus disederhanakan, sisanya "?". */
export function toPrinterText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/·/g, "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/gu, "?");
}

/** Bungkus per kata; kata yang lebih panjang dari satu baris dipotong. */
export function wrapText(text: string, columns: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word;
    while (rest.length > columns) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(rest.slice(0, columns));
      rest = rest.slice(columns);
    }
    if (!current) current = rest;
    else if (current.length + 1 + rest.length <= columns) current = `${current} ${rest}`;
    else {
      lines.push(current);
      current = rest;
    }
  }
  lines.push(current);
  return lines;
}

/** Kiri dibungkus, kanan rata kanan di baris terakhir (atau baris sendiri bila tidak muat). */
function twoColumns(left: string, right: string, columns: number): string[] {
  const room = columns - right.length - 1;
  if (room < 4) return [...wrapText(left, columns), right.padStart(columns)];
  const wrapped = wrapText(left, room);
  const last = wrapped.pop() ?? "";
  return [...wrapped, `${last.padEnd(columns - right.length)}${right}`];
}

export function buildEscPosReceipt(receipt: PublicReceipt, width: PaperWidth): string {
  const columns = receiptColumns(width);
  const text = (value: string) => toPrinterText(value);
  const rule = "-".repeat(columns);
  const lines: string[] = [];
  const row = (left: string, right: string) => lines.push(...twoColumns(text(left), text(right), columns));

  let out = ESC_INIT + ALIGN_CENTER + BOLD_ON;
  out += `${wrapText(text(receipt.clinicName), columns).join("\n")}\n${BOLD_OFF}`;
  out += `${[...wrapText(text(receipt.branchName), columns), ...wrapText(text(receipt.branchAddress), columns)].join("\n")}\n`;
  out += ALIGN_LEFT;

  lines.push(rule);
  row("No.", receipt.number);
  row("Tanggal", formatReceiptDateTime(receipt.finalizedAt));
  row("Kasir", receipt.cashierName);
  row("Atas nama", receipt.customerName);
  lines.push(rule);
  for (const line of receipt.lines) {
    lines.push(...wrapText(text(line.name), columns));
    row(`${line.quantity} x ${formatRupiah(line.unitPrice)}`, formatRupiah(line.amount));
  }
  lines.push(rule);
  row("Subtotal", formatRupiah(receipt.subtotal));
  if (receipt.discount > 0) row("Diskon", `-${formatRupiah(receipt.discount)}`);
  row("Total", formatRupiah(receipt.total));
  for (const payment of receipt.payments) {
    row(`${dateLabel(payment.paidAt)} ${PAYMENT_METHOD_LABEL[payment.method]}`, formatRupiah(payment.amount));
  }
  if (receipt.balance > 0) row("Sisa", formatRupiah(receipt.balance));
  lines.push(rule);
  out += `${lines.join("\n")}\n`;

  out += `${ALIGN_CENTER}${BOLD_ON}${text(RECEIPT_STATUS_LABEL[receipt.status])}${BOLD_OFF}\nTerima kasih\n`;
  return out + CUT_PAPER;
}
