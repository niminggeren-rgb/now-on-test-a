import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 開発用インジケーターは画面左下の操作ボタン（モバイルのボトムバー）に重なるため無効化
  devIndicators: false,
};

export default nextConfig;
