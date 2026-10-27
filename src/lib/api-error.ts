import type { ActionResult } from '@/types/action';

/**
 * API の失敗を、利用者に見せる理由へ変換する。
 * サーバー関数がタイムアウトすると JSON ではなく HTML(504/502) が返るため、本文を読めない場合はステータスから判断する。
 */
export function describeApiFailure(status: number, json: ActionResult<unknown> | null): string {
  if (json && !json.success) return json.error;
  if (status === 413) return '画像のサイズが大きすぎます。枚数を減らすか、別の写真でお試しください。';
  if (status === 504 || status === 502 || status === 408) return '処理がタイムアウトしました。もう一度お試しください。';
  if (status === 429) return 'リクエストが多すぎます。しばらく待ってから再度お試しください。';
  return '解析結果を受け取れませんでした。もう一度お試しください。';
}
