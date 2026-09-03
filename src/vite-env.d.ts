/// <reference types="vite/client" />

declare module "*.wav" {
  const source: string;
  export default source;
}
