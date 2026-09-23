// Edge-compatible JWT verifier using Web Crypto API (HMAC SHA-256)

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

export async function verifySessionTokenEdge(token: string, secretStr: string): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;
    const encoder = new TextEncoder();
    
    // Check payload expiration
    const payloadJson = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
    if (payloadJson.exp && Date.now() >= payloadJson.exp * 1000) {
      return false;
    }
    if (!payloadJson.auth) return false;

    // Verify signature with Web Crypto API
    const keyData = encoder.encode(secretStr);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const dataToVerify = encoder.encode(`${headerB64}.${payloadB64}`);
    const signatureBytes = base64UrlDecode(signatureB64);
    const sigBuffer = signatureBytes.buffer as ArrayBuffer;

    return await crypto.subtle.verify('HMAC', cryptoKey, sigBuffer, dataToVerify);
  } catch (e) {
    return false;
  }
}
