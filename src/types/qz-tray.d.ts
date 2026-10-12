// Tipe minimal qz-tray 2.3 yang dipakai SunDY (receipt-printer.ts). Bukan definisi lengkap pustaka.
declare module "qz-tray" {
  type Resolver<T> = (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void;
  type PrintData = { type: "raw"; format: "command"; flavor: "plain"; data: string };
  const qz: {
    websocket: { isActive(): boolean; connect(options?: { retries?: number; delay?: number }): Promise<void> };
    security: {
      setCertificatePromise(resolver: Resolver<string>): void;
      setSignatureAlgorithm(algorithm: "SHA512"): void;
      setSignaturePromise(factory: (toSign: string) => Resolver<string>): void;
    };
    printers: { find(query?: string): Promise<string[] | string> };
    configs: { create(printer: string): unknown };
    print(config: unknown, data: PrintData[]): Promise<void>;
  };
  export default qz;
}
