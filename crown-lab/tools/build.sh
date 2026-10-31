#!/bin/sh
# app.html（Artifact用の本体）を Web 用の完全な index.html に包む
cd "$(dirname "$0")/.."
{ printf '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#070b14"><meta name="apple-mobile-web-app-capable" content="yes"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%%}[hidden]{display:none!important}</style></head><body>'; cat app.html; printf '</body></html>\n'; } > index.html
