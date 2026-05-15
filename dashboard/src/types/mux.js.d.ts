declare module 'mux.js' {
  namespace muxjs {
    namespace mp4 {
      class Transmuxer {
        constructor();
        push(data: Uint8Array): void;
        flush(): void;
        dispose(): void;
        on(event: 'data', callback: (segment: { type: string; data: Uint8Array }) => void): void;
        off(event: 'data', callback: (...args: any[]) => void): void;
      }
    }
  }
  export default muxjs;
}
