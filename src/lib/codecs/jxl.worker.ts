import decode from '@jsquash/jxl/decode.js'

const handleMessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const image = await decode(event.data)
    globalThis.postMessage({image}, {transfer: [image.data.buffer]})
  } catch {
    globalThis.postMessage({error: 'JPEG XL decoding failed.'})
  }
}
globalThis.addEventListener('message', event => void handleMessage(event as MessageEvent<ArrayBuffer>))
