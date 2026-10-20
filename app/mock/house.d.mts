/* The types of mock/house.mjs, for the pretend house's entry (src/try.ts), which is TypeScript. */
export type HouseRequest = { method?: string; url: string; headers?: Record<string, string>; body?: string }
export type HouseAnswer =
  | { pass?: false; status: number; headers: Record<string, string>; body: string | Uint8Array }
  | { pass: true; headers: Record<string, string> }
export type House = {
  handle(req: HouseRequest): Promise<HouseAnswer>
  listen(fn: (text: string) => void): () => void
}
export function createHouse(options?: { env?: Record<string, string | undefined>; qr?: ((text: string) => string | Uint8Array | null) | null }): House
