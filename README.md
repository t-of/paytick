# PAYTICK — 時給を1秒ごとに数える秒給メーター

時給と働く時間を入れてスタートすると、稼いだ金額が1秒ごとにカウントアップする秒給メーター。

## 🔗 リンク

- 使う: https://t-of.github.io/paytick/
- 制作: [T.OF...](https://t-of.github.io/)

## 遊び方

1. 時給（円）と働く時間（時間・分）を入れる。秒給・分給・ゴールの金額がその場で出る。
2. 「スタート」で、いまの稼ぎと経過時間が1秒ごとに増えていく。100 円ごとにコインの音が鳴る。
3. 「一時停止」で止めて「再開」で続ける。ゴールに着くと「おつかれさまでした」と出て、結果を共有できる。
4. 動いている間は画面が消えないようにする（対応しているブラウザ）。閉じても、開き直すと続きから数える。

## アプリとして入れる（PWA）

- iPhone / iPad: Safari で開き、共有 → 「ホーム画面に追加」
- Android / PC の Chrome・Edge: 画面の「アプリにする」ボタン、またはアドレスバーのインストールボタン

## 開発

ビルド不要。フォルダをそのまま静的サーバで開く。

```sh
python3 -m http.server 8000   # → http://localhost:8000/
```

保存するもの（すべて端末の localStorage）:

- `paytick.inputs` … 最後に入れた時給と時間 `{ v: 1, wage, hours, minutes }`
- `paytick.run` … 動いているメーター `{ v: 1, wage, totalSec, startedAt, pausedTotal, pausedAt }`
- `paytick.sound` … 音のオン・オフ

元は個人のリポジトリ Sora3141/wage-counter（秒給メーター）。2026-11 に T.OF... へ移した。
