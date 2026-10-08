import { createTheme } from "@mui/material/styles";
import { COLOR_SCHEME_SELECTOR } from "@/lib/color-mode";

// Tema SunDY untuk panel admin (spec MUI 3.3, 5). Hanya dipakai di bawah layout grup admin.

export const SUNDY = {
  cream50: "#fffdf7",
  cream100: "#fdf6e3",
  cream200: "#f7edd4",
  cream300: "#f0e2bd",
  gold300: "#efd08c",
  gold400: "#e8b84b",
  gold500: "#d4a017",
  gold600: "#b8860b",
  brown600: "#8a7047",
  brown700: "#6b5535",
  brown800: "#4a3c28",
  brown900: "#2e2517",
} as const;

export const DARK = {
  background: "#14100a",
  paper: "#1f1810",
  paperRaised: "#2a2117",
  text: "#f7edd4",
  textSecondary: "#cbb994",
  primary: "#e8b84b",
  primaryContrast: "#14100a",
  divider: "rgba(240, 226, 189, 0.16)",
} as const;

/** Warna status per skema; diuji kontrasnya di admin-theme.test.ts. */
export const STATUS = {
  light: { error: "#b3261e", warning: "#9a5b00", info: "#0b5c8a", success: "#2e6b30" },
  dark: { error: "#f28b82", warning: "#f0b25a", info: "#7cc4f2", success: "#7fcf86" },
} as const;

const FONT_SANS = "var(--font-jakarta), ui-sans-serif, system-ui, sans-serif";
const FONT_DISPLAY = "var(--font-cormorant), Georgia, serif";

export const adminTheme = createTheme({
  cssVariables: { colorSchemeSelector: COLOR_SCHEME_SELECTOR },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: SUNDY.gold500, light: SUNDY.gold300, dark: SUNDY.gold600, contrastText: SUNDY.brown900 },
        secondary: { main: SUNDY.brown800, contrastText: SUNDY.cream50 },
        background: { default: SUNDY.cream50, paper: "#ffffff" },
        text: { primary: SUNDY.brown900, secondary: SUNDY.brown700 },
        divider: SUNDY.cream300,
        // Warna status gelap secukupnya agar terbaca sebagai teks dan sebagai latar chip (≥ 4,5:1).
        error: { main: STATUS.light.error, contrastText: "#ffffff" },
        warning: { main: STATUS.light.warning, contrastText: "#ffffff" },
        info: { main: STATUS.light.info, contrastText: "#ffffff" },
        success: { main: STATUS.light.success, contrastText: "#ffffff" },
      },
    },
    dark: {
      palette: {
        primary: { main: DARK.primary, light: SUNDY.gold300, dark: SUNDY.gold500, contrastText: DARK.primaryContrast },
        secondary: { main: SUNDY.cream200, contrastText: DARK.background },
        background: { default: DARK.background, paper: DARK.paper },
        text: { primary: DARK.text, secondary: DARK.textSecondary },
        divider: DARK.divider,
        error: { main: STATUS.dark.error, contrastText: DARK.background },
        warning: { main: STATUS.dark.warning, contrastText: DARK.background },
        info: { main: STATUS.dark.info, contrastText: DARK.background },
        success: { main: STATUS.dark.success, contrastText: DARK.background },
      },
    },
  },
  typography: {
    fontFamily: FONT_SANS,
    h1: { fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: "2rem", lineHeight: 1.15 },
    h2: { fontFamily: FONT_SANS, fontWeight: 600, fontSize: "1rem", lineHeight: 1.4 },
    h3: { fontFamily: FONT_SANS, fontWeight: 600, fontSize: "0.95rem" },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      // Emas merek terlalu terang sebagai warna teks di latar krem (± 2,4:1). Tombol garis/teks
      // memakai warna teks utama; tombol penuh tetap emas dengan teks cokelat tua.
      variants: [
        { props: { variant: "text", color: "primary" }, style: { color: "var(--mui-palette-text-primary)" } },
        {
          props: { variant: "outlined", color: "primary" },
          style: { color: "var(--mui-palette-text-primary)", borderColor: "rgba(var(--mui-palette-text-primaryChannel) / 0.35)" },
        },
      ],
    },
    // Tautan mengikuti warna teks di sekitarnya (seperti sebelumnya), bergaris bawah saat disorot.
    MuiLink: { defaultProps: { color: "inherit", underline: "hover" }, styleOverrides: { root: { fontWeight: 500 } } },
    // Kotak centang, radio, sakelar, dan garis fokus isian memakai cokelat (terang) / krem (gelap): kontras ≥ 3:1.
    MuiCheckbox: { defaultProps: { color: "secondary" } },
    MuiRadio: { defaultProps: { color: "secondary" } },
    MuiSwitch: { defaultProps: { color: "secondary" } },
    MuiTextField: { defaultProps: { size: "small", color: "secondary" } },
    MuiChip: { defaultProps: { size: "small" } },
    // Sel angka (rata kanan) tidak dipenggal, seperti tabel lama: "-Rp 3.200.000" tidak pecah menjadi dua baris
    // di ponsel. Sel teks tetap boleh turun baris; tabel dibungkus TableContainer yang bisa digulir mendatar.
    MuiTableCell: { styleOverrides: { alignRight: { whiteSpace: "nowrap" } } },
    MuiAppBar: { defaultProps: { elevation: 0, color: "inherit" } },
    MuiDialog: { defaultProps: { fullWidth: true, maxWidth: "sm" } },
    MuiCard: {
      defaultProps: { variant: "outlined" },
      styleOverrides: { root: { boxShadow: "0 1px 2px rgba(46, 37, 23, 0.06), 0 6px 16px rgba(46, 37, 23, 0.05)" } },
    },
  },
});
