# Nvidia API セットアップガイド

このプロジェクトで [Nvidia API (OpenAI互換)](https://integrate.api.nvidia.com/v1) を使えるようにしました。  
ユーザーが提示したPythonコードを TypeScript / Next.js でそのまま再現できます。

## 1. APIキーの取得

1. https://build.nvidia.com/ にアクセスし、使いたいモデルを開く  
   例: `nvidia/nemotron-3.5-super-vl-120b-a12b`
2. 「Get API Key」→ Nvidiaのアカウントでログイン → `nvapi-...` 形式のキーをコピー
3. `.env.local` に追記:

```bash
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# 任意 (未設定ならデフォルトが使われる)
# NVIDIA_MODEL=nvidia/nemotron-3.5-super-vl-120b-a12b
# NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
```

4. `GET /api/ai/status` で `nvidia: true` になればOK

```bash
curl http://localhost:3000/api/ai/status | jq
# { "gemini": false, "nvidia": true, "nvidiaModel": "nvidia/nemotron-3.5-super-vl-120b-a12b", ... }
```

## 2. Pythonコード → TypeScript 対応表

| Python (openai) | TypeScript (このリポジトリ) |
|-----------------|------------------------------|
| `OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=os.environ["NVIDIA_API_KEY"])` | `new OpenAI({ baseURL: "https://integrate.api.nvidia.com/v1", apiKey: process.env.NVIDIA_API_KEY })` または `getNvidiaClient()` |
| `client.chat.completions.create({ model, messages, ... })` | `client.chat.completions.create({ model, messages, ... })` 同じ |
| `stream=True` + `for chunk in completion:` | `stream: true` + `for await (const chunk of completion)` |
| `chunk.choices[0].delta.reasoning_content` | `chunk.choices[0].delta.reasoning_content` (Nemotronの思考過程) |
| `extra_body={"chat_template_kwargs": {"enable_thinking": True}}` | `extra_body: { chat_template_kwargs: { enable_thinking: true } }` |

## 3. スクリプトから直接叩く（Pythonと同等のスタンドアロン実行）

```bash
# .env.local から読む場合: dotenvを使うか、環境変数をexport
export NVIDIA_API_KEY=nvapi-...
npx tsx scripts/nvidia-example.ts              # ストリーミング (デフォルト)
STREAM=false npx tsx scripts/nvidia-example.ts # 1回で受ける
```

`scripts/nvidia-example.ts` は、提示されたPythonコードを1:1でTypeScriptに翻訳したものです。  
画像URL `https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1a.jpg` の標識を読み取ります。

## 4. Next.jsアプリ内から叩く（推奨: APIキーをクライアントに晒さない）

### 4-a. 汎用チャット (Vision対応) — `POST /api/ai/nvidia-chat`

Pythonの `messages=[{"role":"user","content":[{"type":"text",...},{"type":"image_url",...}]}]` をそのままJSONで送れます。

```bash
curl -X POST http://localhost:3000/api/ai/nvidia-chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": [
          { "type": "text", "text": "Read the traffic sign in this image. What does it say, and what color is the sign?" },
          { "type": "image_url", "image_url": { "url": "https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1a.jpg" } }
        ]
      }
    ],
    "temperature": 1,
    "top_p": 0.95,
    "max_tokens": 16384,
    "stream": false,
    "extra_body": { "chat_template_kwargs": { "enable_thinking": true } }
  }' | jq
```

ストリーミングする場合: `"stream": true` にすると `text/event-stream` で `reasoning` と `content` がSSEで流れてきます。

```ts
// ブラウザ/サーバーからのfetch例 (ストリーミング)
const res = await fetch('/api/ai/nvidia-chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: [{ type: 'text', text: '標識を読み取って' }, { type: 'image_url', image_url: { url: 'https://...' } }] }],
    stream: true,
  }),
});
const reader = res.body!.getReader();
// SSE: data: {"type":"reasoning","content":"..."}
//      data: {"type":"content","content":"..."}
```

### 4-b. シンプルVisionデモ — `POST /api/ai/nvidia-vision`

画像1枚と質問だけ送る簡易版:

```bash
curl -X POST http://localhost:3000/api/ai/nvidia-vision \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1a.jpg",
    "prompt": "Read the traffic sign in this image. What does it say, and what color is the sign?",
    "stream": false
  }' | jq
```

`stream: true` なら `text/plain` でストリーミング、`false` なら `{ success:true, data:{ text, model } }` を返す。

### 4-c. 汎用プロキシ — `POST /api/ai/nvidia-proxy?path=chat/completions`

任意のOpenAI互換リクエストをそのまま透過させたい場合:

```bash
curl -X POST "http://localhost:3000/api/ai/nvidia-proxy?path=chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"nvidia/nemotron-3.5-super-vl-120b-a12b","messages":[{"role":"user","content":"Hello"}],"stream":false}' | jq
```

## 5. サーバーサイド（Route Handler / Server Action）から直接呼ぶ

```ts
import { getNvidiaClient, resolveNvidiaModel } from '@/lib/nvidia/client';

export async function POST() {
  const client = getNvidiaClient();
  if (!client) return Response.json({ error: 'NVIDIA_API_KEY未設定' }, { status: 503 });

  const completion = await client.chat.completions.create({
    model: resolveNvidiaModel(),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'この画像の標識は何色？' },
          { type: 'image_url', image_url: { url: 'https://...' } },
        ],
      },
    ],
    temperature: 1,
    top_p: 0.95,
    max_tokens: 16384,
    seed: 42,
    extra_body: { chat_template_kwargs: { enable_thinking: true } },
    stream: false,
  } as never);

  // completion.choices[0].message.content
}
```

`src/lib/nvidia/chat.ts` の `createNvidiaChatCompletion()` / `streamNvidiaChatCompletion()` ヘルパーも使えます。

## 6. 環境変数一覧

| 変数 | 必須 | 説明 |
|------|------|------|
| `NVIDIA_API_KEY` | ✅ | `nvapi-...` 形式のキー。`NVDA_API_KEY` でも可 |
| `NVIDIA_MODEL` | 任意 | デフォルト `nvidia/nemotron-3.5-super-vl-120b-a12b` |
| `NVIDIA_BASE_URL` | 任意 | デフォルト `https://integrate.api.nvidia.com/v1` |

## 7. トラブルシュート

- `nvidia: false` のまま → `.env.local` を編集後 `npm run dev` を再起動
- `401` → キーの前後に空白/引用符が入っていないか確認。`nvapi-` で始まるか確認
- `429` → レート制限。しばらく待つか、Nvidia側の利用枠を確認
- ストリームが途切れる → `maxDuration = 120` に設定済み。Vercelのプラン上限に合わせて `vercel.json` で調整

## 8. ファイル構成

```
src/lib/nvidia/
  client.ts  … キー解決・クライアント生成・モデル/ベースURL管理（Geminiのclient.tsと同等の責務）
  chat.ts    … createNvidiaChatCompletion / streamNvidiaChatCompletion ヘルパー
src/app/api/ai/
  nvidia-chat/route.ts    … 汎用チャット（Vision対応、stream対応）
  nvidia-vision/route.ts  … 1枚画像+質問の簡易デモ
  nvidia-proxy/route.ts    … 任意パスの透過プロキシ
  status/route.ts          … nvidiaの有無も返すように拡張
scripts/
  nvidia-example.ts        … PythonコードのTypeScript版スタンドアロン実行例
```
