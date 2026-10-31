"""lessons/*.json の本文・単語・例文から高品質ナレーション(mp3)を生成し audio/index.json を更新する"""
import asyncio, json, os, re, sys, pathlib
import edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent
VOICE = os.environ.get("VOICE", "en-US-AvaNeural")  # 女性のニューラル音声
AUD = ROOT / "audio"

def norm(t): return re.sub(r"\s+", " ", t).strip()
def fnv(t):  # アプリ側と同じ FNV-1a 32bit
    h = 0x811C9DC5
    for b in norm(t).encode("utf-8"):
        h ^= b; h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"
def texts(l):
    for p in l.get("paragraphs", []):
        for s in p.get("sentences", []): yield s["en"]
    for v in l.get("vocab", []):
        yield re.sub(r"\b[AB]\b|[~〜]", "", v["w"]); yield v.get("ex", "")

async def main():
    AUD.mkdir(exist_ok=True)
    todo = {}
    for f in sorted((ROOT / "lessons").glob("*.json")):
        for t in texts(json.loads(f.read_text("utf-8"))):
            if norm(t): todo[fnv(t)] = norm(t)
    for h, t in todo.items():
        out = AUD / f"{h}.mp3"
        if out.exists() and out.stat().st_size > 0: continue
        for _ in range(3):
            try:
                await edge_tts.Communicate(t, VOICE, rate="-5%").save(str(out)); break
            except Exception as e: print("retry", h, e, file=sys.stderr)
    have = sorted(p.stem for p in AUD.glob("*.mp3") if p.stat().st_size > 0)
    (AUD / "index.json").write_text(json.dumps(have), "utf-8")
    print(len(todo), "texts /", len(have), "files")

asyncio.run(main())
