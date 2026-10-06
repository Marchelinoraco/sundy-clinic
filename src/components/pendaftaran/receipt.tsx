import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatIndonesianDate, formatRupiah } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { BookingReceipt } from "@/server/public-booking";

export function Receipt({ receipt, onRegisterAgain }: { receipt: BookingReceipt; onRegisterAgain?: () => void }) {
  const time = minutesToTimeLabel(witaMinutesOfDay(receipt.startAt));
  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-10 text-center">
      <h1 className="font-display text-3xl text-brown-900">Pendaftaran diterima</h1>

      <div className="rounded-2xl bg-cream-100 p-5">
        <p className="text-sm text-brown-600">Kode booking</p>
        <p className="mt-1 font-mono text-3xl font-semibold tracking-wider text-brown-900">{receipt.code}</p>
      </div>

      {receipt.online ? (
        <dl className="space-y-1 text-left text-sm text-brown-700">
          <div><dt className="inline font-semibold">Layanan: </dt><dd className="inline">{receipt.serviceName}</dd></div>
          <div><dt className="inline font-semibold">Dengan: </dt><dd className="inline">{receipt.staffName}</dd></div>
          <div><dt className="inline font-semibold">Cara: </dt><dd className="inline">Online lewat WhatsApp (telepon/video)</dd></div>
          <div>
            <dt className="font-semibold">Waktu Anda bisa dihubungi:</dt>
            <dd>
              <ul className="list-disc pl-5">
                {receipt.online.windowLines.map((line) => (
                  <li key={line}>{line.replace(/^• /, "")}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>Dokter akan menghubungi nomor {receipt.online.maskedWhatsapp} lewat WhatsApp.</div>
        </dl>
      ) : (
        <dl className="space-y-1 text-left text-sm text-brown-700">
          <div><dt className="inline font-semibold">Layanan: </dt><dd className="inline">{receipt.serviceName}</dd></div>
          <div><dt className="inline font-semibold">Dengan: </dt><dd className="inline">{receipt.staffName}</dd></div>
          <div><dt className="inline font-semibold">Cabang: </dt><dd className="inline">{receipt.branchName}</dd></div>
          <div>
            <dt className="inline font-semibold">Jadwal: </dt>
            <dd className="inline">{formatIndonesianDate(receipt.startAt)}, pukul {time} WITA</dd>
          </div>
        </dl>
      )}

      {receipt.bookingFee !== null && (
        <div className="rounded-2xl border border-gold-500 p-4 text-left text-sm text-brown-800">
          {receipt.bankAccount ? (
            <p>
              Transfer{" "}
              {receipt.online ? (
                <>
                  total <strong>{formatRupiah(receipt.online.total)}</strong> (biaya booking {formatRupiah(receipt.bookingFee)} +{" "}
                  {receipt.serviceName} {formatRupiah(receipt.online.servicePrice)})
                </>
              ) : (
                <>
                  biaya booking <strong>{formatRupiah(receipt.bookingFee)}</strong>
                </>
              )}{" "}
              ke <strong>{receipt.bankAccount}</strong>, lalu kirim bukti transfernya lewat tombol di bawah.
            </p>
          ) : (
            <p>
              Admin kami akan mengirim nomor rekening untuk{" "}
              {receipt.online ? `total ${formatRupiah(receipt.online.total)}` : `biaya booking ${formatRupiah(receipt.bookingFee)}`} lewat
              WhatsApp.
            </p>
          )}
          <p className="mt-2 text-brown-600">
            Booking yang belum dikonfirmasi dalam 24 jam dibatalkan otomatis (hari Minggu dan hari libur tidak
            dihitung).
          </p>
        </div>
      )}

      <Button asChild size="lg" className="h-12 w-full rounded-full text-base">
        <a href={receipt.confirmationLink} target="_blank" rel="noopener noreferrer">
          Konfirmasi via WhatsApp
        </a>
      </Button>
      <Link href="/cek-booking" className="block text-sm text-brown-700 underline underline-offset-4">
        Cek status booking
      </Link>
      {onRegisterAgain && (
        <button type="button" onClick={onRegisterAgain} className="block w-full text-sm text-brown-700 underline underline-offset-4">
          Daftar lagi
        </button>
      )}
    </div>
  );
}
