import { NextResponse, type NextRequest } from 'next/server';
import { describeNvidiaError, getNvidiaClient } from '@/lib/nvidia/client';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 120;

const rateLimited = createRateLimiter(10);

/**
 * 汎用プロキシ: OpenAI互換の任意のパスを Nvidia APIへ転送
 * POST /api/ai/nvidia-proxy?path=chat/completions
 * Bodyはそのまま Nvidiaへ流す。クライアントにAPIキーを晒さずに済む。
 */
export async function POST(request: NextRequest) {
  if (rateLimited(clientKey(request.headers))) {
    return NextResponse.json({ success: false, error: 'リクエストが多すぎます' }, { status: 429 });
  }

  const client = getNvidiaClient();
  if (!client) {
    return NextResponse.json(
      { success: false, error: 'NVIDIA_API_KEY が未設定です。.env.local に設定してください。' },
      { status: 503 },
    );
  }

  // pathクエリがあればそれを、なければ bodyのpathを見る
  const url = new URL(request.url);
  const path = url.searchParams.get('path') ?? 'chat/completions';

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'JSONが不正です' }, { status: 400 });
  }

  // OpenAI SDK経由ではなく fetch で直接叩くことで、任意の拡張フィールドを透過的に通す
  const { resolveNvidiaBaseUrl } = await import('@/lib/nvidia/client');
  const nvidiaBase = resolveNvidiaBaseUrl();
  const target = `${nvidiaBase.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

  const apiKey = process.env.NVIDIA_API_KEY ?? process.env.NVDA_API_KEY ?? '';
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const isStream = (body as { stream?: boolean })?.stream === true;
    if (isStream) {
      // ストリーミングはそのままパイプ
      if (!res.body) return NextResponse.json({ success: false, error: 'ストリーム取得失敗' }, { status: 502 });
      return new Response(res.body, {
        headers: {
          'Content-Type': res.headers.get('content-type') ?? 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
        },
        status: res.status,
      });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ success: false, error: describeNvidiaError(err) }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({
    usage: 'POST /api/ai/nvidia-proxy?path=chat/completions で任意のOpenAI互換リクエストをNvidiaへプロキシ',
    example: {
      url: '/api/ai/nvidia-proxy?path=chat/completions',
      body: {
        model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        stream: false,
      },
    },
  });
}
