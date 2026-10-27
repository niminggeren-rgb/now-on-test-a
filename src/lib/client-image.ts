export interface PreparedImage {
  id: string;
  previewUrl: string;
  mimeType: 'image/webp' | 'image/jpeg';
  /** data URL */
  base64Data: string;
  originalBytes: number;
  compressedBytes: number;
}

const MAX_EDGE = 1600;
const WEBP_QUALITY = 0.8;
const JPEG_QUALITY = 0.85;

/** data URL 内の base64 から復号後のバイト数を概算する */
function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** 元サイズに対する削減率（%）。拡大した場合は 0。 */
export function savedPercent(img: Pick<PreparedImage, 'originalBytes' | 'compressedBytes'>): number {
  if (img.originalBytes <= 0) return 0;
  return Math.max(0, Math.round((1 - img.compressedBytes / img.originalBytes) * 100));
}

/**
 * スマホ撮影の高解像度写真（4〜8MB）を、長辺1600pxの WebP（品質0.8）へ縮小して転送量と Vision トークンを減らす。
 * WebP を書き出せないブラウザ（Safari 等は PNG にフォールバックする）では JPEG にする。
 * 形式（HEIC 等）をブラウザが復号できない場合は例外を投げる。
 */
export async function prepareImageFile(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像を処理できませんでした');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high'; // 鉛筆・赤ペンの細い筆跡を潰さない
    ctx.fillStyle = '#fff'; // 透過PNGが黒くならないようにする
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let mimeType: PreparedImage['mimeType'] = 'image/webp';
    let dataUrl = canvas.toDataURL('image/webp', WEBP_QUALITY);
    if (!dataUrl.startsWith('data:image/webp')) {
      mimeType = 'image/jpeg';
      dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    }
    return {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      previewUrl: dataUrl,
      mimeType,
      base64Data: dataUrl,
      originalBytes: file.size,
      compressedBytes: dataUrlBytes(dataUrl),
    };
  } finally {
    bitmap.close();
  }
}
