# Wuu-Tavern

基于 [OpenTavern](https://github.com/PawNzZi/opentavern) 官网正在运行的版本（`opentavern.pages.dev`），加上账本增强：

- 气泡里隐藏 `<Ledger>`（存盘和下一轮提示词仍保留）
- 每轮回复结束后，把 Ledger 写入**本对话作者注释**
- 同时写入世界书 `Wuu账本` 里的 Constant 条目 `【当前账本】`

官方站点不会变。本仓库是你自己的一份。

## 打开 Pages

1. 打开仓库 **Settings → Pages**
2. Source 选 **Deploy from a branch**
3. Branch 选 `main`，文件夹 `/ (root)`
4. 保存后等 1–2 分钟
5. Safari 打开：`https://wuuule.github.io/Wuu-Tavern/`

若 404，确认仓库是 Public，并且根目录有 `index.html` 和 `.nojekyll`。

## 从官网搬家

新网址是新源，聊天记录不会自动过来。在官网导出角色卡 / 世界书 / 对话，到本站再导入。API Key 也要在本站设置里重填。

## 使用

1. 打开任意对话 → 作者注释按钮
2. 底部有「Wuu 账本」开关，默认全开
3. 角色卡回复后指令里要求模型在正文结束后输出：

```text
<Ledger>
日:第X天·时辰 地:… 烙:…
约:蔡.3=D10夜 石.3=D8酉
蔡丽:口认 服4 …
</Ledger>
```

没有 `<Ledger>` 就不会改作者注释和世界书。旧令只记录，不自动开演。

## 更新

上游 OpenTavern 更新后，用新的官网 `index.html` 替换本仓库的 `index.html`，再保留文件末尾这行：

```html
<script src="./wuu-ledger.js"></script>
```
