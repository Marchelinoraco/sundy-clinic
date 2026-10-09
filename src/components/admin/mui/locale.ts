import type { PickersLocaleText } from "@mui/x-date-pickers/locales";

/**
 * Teks pemilih tanggal berbahasa Indonesia. MUI X 9 belum punya terjemahan Indonesia untuk pickers
 * (DataGrid punya: `idID` dari `@mui/x-data-grid/locales`, dipakai AdminDataGrid).
 */
export const PICKERS_LOCALE_ID: Partial<PickersLocaleText> = {
  previousMonth: "Bulan sebelumnya",
  nextMonth: "Bulan berikutnya",
  openPreviousView: "Tampilan sebelumnya",
  openNextView: "Tampilan berikutnya",
  calendarViewSwitchingButtonAriaLabel: (view) =>
    view === "year" ? "Pilihan tahun terbuka, beralih ke kalender" : "Kalender terbuka, beralih ke pilihan tahun",
  cancelButtonLabel: "Batal",
  clearButtonLabel: "Kosongkan",
  okButtonLabel: "OK",
  todayButtonLabel: "Hari ini",
  datePickerToolbarTitle: "Pilih tanggal",
  openDatePickerDialogue: (formattedDate) => (formattedDate ? `Pilih tanggal, terpilih ${formattedDate}` : "Pilih tanggal"),
  fieldClearLabel: "Kosongkan",
  dateTableLabel: "pilih tanggal",
  fieldYearPlaceholder: (params) => "T".repeat(params.digitAmount),
  fieldMonthPlaceholder: (params) => (params.contentType === "letter" ? "BBBB" : "BB"),
  fieldDayPlaceholder: () => "HH",
  year: "Tahun",
  month: "Bulan",
  day: "Hari",
  empty: "Kosong",
};
