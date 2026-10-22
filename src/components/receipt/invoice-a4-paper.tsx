import { CLINIC_INSTAGRAM, CLINIC_TAGLINE, CLINIC_WHATSAPP_DISPLAY } from "@/lib/clinic";
import { formatRupiah } from "@/lib/format";
import { INVOICE_A4_STAMP, packageItemText, type InvoiceA4 } from "@/lib/invoice-a4";
import { formatReceiptDateTime } from "@/lib/receipt";
import { dateLabel } from "@/lib/stock";

// Invoice A4 (spec invoice A4): kop surat, cap air status, item, pembayaran, dan progres paket. Tanpa MUI dan Tailwind
// (seperti ReceiptPaper): dipakai halaman publik /invoice dan halaman cetak panel. Kop memakai <div>, bukan <header>,
// karena aturan cetak panel menyembunyikan semua <header>.

function Row({ left, right, strong = false }: { left: string; right: string; strong?: boolean }) {
  return (
    <div className={strong ? "invoice-a4-baris invoice-a4-baris-tebal" : "invoice-a4-baris"}>
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

export function InvoiceA4Paper({ invoice }: { invoice: InvoiceA4 }) {
  const stamp = INVOICE_A4_STAMP[invoice.status];
  return (
    <section aria-label={`Invoice ${invoice.number}`} className="invoice-a4">
      <div role="img" aria-label={`Status ${stamp}`} className={`invoice-a4-cap invoice-a4-cap-${invoice.status.toLowerCase()}`}>
        {stamp}
      </div>
      <div className="invoice-a4-kop">
        <div>
          <div className="invoice-a4-wordmark">
            <span className="invoice-a4-sun">Sun</span>
            <span className="invoice-a4-dy">DY</span>
          </div>
          <div className="invoice-a4-sub">Nutrition, Slimming &amp; Wellness Clinic</div>
        </div>
        <div className="invoice-a4-kontak">
          <div>{invoice.branchName}</div>
          <div>{invoice.branchAddress}</div>
          <div>
            WA {CLINIC_WHATSAPP_DISPLAY} · IG @{CLINIC_INSTAGRAM}
          </div>
          <div>sundyclinic.com</div>
        </div>
      </div>

      <div className="invoice-a4-judul">
        <h1>INVOICE</h1>
        <div className="invoice-a4-meta invoice-a4-kanan">
          <div>
            No. <strong>{invoice.number}</strong>
          </div>
          <div>
            Tanggal <strong>{formatReceiptDateTime(invoice.finalizedAt)}</strong>
          </div>
          <div>Kasir: {invoice.cashierName}</div>
        </div>
      </div>
      <p className="invoice-a4-meta">
        Kepada: <strong>{invoice.customerName}</strong> · RM {invoice.medicalRecordNumber}
      </p>

      <table className="invoice-a4-tabel">
        <thead>
          <tr>
            <th>Item</th>
            <th className="invoice-a4-angka">Jumlah</th>
            <th className="invoice-a4-angka">Harga</th>
            <th className="invoice-a4-angka">Total</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line, index) => (
            <tr key={index}>
              <td>
                {line.name}
                {line.note && <span className="invoice-a4-catatan">{line.note}</span>}
                {line.discount > 0 && <span className="invoice-a4-catatan">Diskon -{formatRupiah(line.discount)}</span>}
              </td>
              <td className="invoice-a4-angka">
                {line.quantity}
                {line.unit ? ` ${line.unit}` : ""}
              </td>
              <td className="invoice-a4-angka">{formatRupiah(line.unitPrice)}</td>
              <td className="invoice-a4-angka">{formatRupiah(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="invoice-a4-total">
        <Row left="Subtotal" right={formatRupiah(invoice.subtotal)} />
        {invoice.itemDiscount > 0 && <Row left="Diskon item" right={`-${formatRupiah(invoice.itemDiscount)}`} />}
        {invoice.discount > 0 && <Row left="Diskon" right={`-${formatRupiah(invoice.discount)}`} />}
        <Row left="Total" right={formatRupiah(invoice.total)} strong />
        {invoice.payments.map((payment, index) => (
          <Row key={index} left={payment.text} right={formatRupiah(payment.amount)} />
        ))}
        {invoice.balance > 0 && invoice.status !== "DIBATALKAN" && <Row left="Sisa" right={formatRupiah(invoice.balance)} strong />}
      </div>

      {invoice.packages.length > 0 && (
        <section aria-label="Paket Anda" className="invoice-a4-paket">
          <h2>Paket Anda</h2>
          {invoice.packages.map((pkg, index) => (
            <div key={index}>
              <h3>
                {pkg.name} · berlaku s.d. {dateLabel(pkg.expiresOn)}
              </h3>
              {pkg.items.map((item, itemIndex) => (
                <div key={itemIndex} className="invoice-a4-isi">
                  <div className="invoice-a4-baris">
                    <span>{item.name}</span>
                    <span>{packageItemText(item)}</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={item.name}
                    aria-valuemin={0}
                    aria-valuemax={item.total}
                    aria-valuenow={item.used}
                    className="invoice-a4-bar"
                  >
                    <span style={{ width: `${item.total > 0 ? Math.min(100, (item.used / item.total) * 100) : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      <div className="invoice-a4-penutup">
        <span>Terima kasih atas kepercayaan Anda.</span>
        <span>
          SunDY Clinic · {CLINIC_TAGLINE}
        </span>
      </div>
    </section>
  );
}
