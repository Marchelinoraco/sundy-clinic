"use client";

import Button, { type ButtonProps } from "@mui/material/Button";
import MuiLink, { type LinkProps as MuiLinkProps } from "@mui/material/Link";
import NextLink from "next/link";
import type { ReactNode } from "react";

// Tautan next/link dengan gaya MUI. Halaman server memakai ini, bukan `component={Link}`, karena
// komponen tidak boleh dikirim sebagai props dari server ke klien.

type LinkButtonProps = Pick<ButtonProps, "variant" | "color" | "size" | "startIcon" | "endIcon" | "fullWidth" | "disabled" | "sx"> & {
  href: string;
  children: ReactNode;
  "aria-label"?: string;
  /** Unduhan berkas (mis. CSV): jangkar biasa, bukan navigasi Next. */
  download?: boolean;
};

export function LinkButton({ href, children, download = false, ...props }: LinkButtonProps) {
  if (download) {
    return (
      <Button component="a" href={href} download {...props}>
        {children}
      </Button>
    );
  }
  return (
    <Button component={NextLink} href={href} {...props}>
      {children}
    </Button>
  );
}

type TextLinkProps = Pick<MuiLinkProps, "color" | "sx" | "underline"> & {
  href: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-current"?: "page";
};

export function TextLink({ href, children, underline = "hover", ...props }: TextLinkProps) {
  return (
    <MuiLink component={NextLink} href={href} underline={underline} {...props}>
      {children}
    </MuiLink>
  );
}
