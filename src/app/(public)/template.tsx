/**
 * Template dirender ulang setiap pindah halaman, jadi isi baru selalu masuk
 * dengan pudar + naik ±12 px. Animasinya CSS (.page-in di globals.css) dan
 * mati untuk "kurangi gerakan". Header, footer, dan tombol WhatsApp ada di
 * layout, jadi tidak ikut beranimasi.
 */
export default function PublicTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
