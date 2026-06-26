declare module 'opentype.js' {
  export function parse(buffer: ArrayBuffer): any
  export function load(url: string, callback: (err: any, font: any) => void): void
  export class Font {
    supported: boolean
  }
}

declare module 'fontkit' {
  export default function create(buffer: ArrayBuffer | Buffer): any
}
