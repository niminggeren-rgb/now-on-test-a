export interface PreparedImage {
  id: string;
  previewUrl: string;
  mimeType: 'image/jpeg';
  /** data URL（JPEG） */
  base64Data: string;
}

const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.85;

/**
 * スマホ撮影の高解像度写真（5〜10MB）を、OCR に十分な 長辺2000px の JPEG へ縮小する。
 * 形式（HEIC 等）をブラウザが復号できない場合は例外を投げる。
 */
export async function prepareImageFile(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像を処理できませんでした');
    ctx.fillStyle = '#fff'; // 透過PNGが JPEG 化で黒くならないようにする
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      previewUrl: dataUrl,
      mimeType: 'image/jpeg',
      base64Data: dataUrl,
    };
  } finally {
    bitmap.close();
  }
}
