# Wuu-Tavern

在开源 [OpenTavern](https://opentavern.pages.dev) 上叠加的**通用**增强，和任何一张角色卡、任何一个剧本都无关。

猎艳录只是你会导入的内容。换校园、换修仙、换别的卡，状态中心一样用。

## 加了什么

1. **显示层藏块**：模型可以在回复里写表，气泡里不显示。
2. **状态中心**：每张角色卡最多 50 张命名表，导出卡会带走。
3. **世界书镜像**：可选同步到 `OT状态中心`。

## 模型怎么写表

```text
<StatusTable name="日历">
第12天·夜
</StatusTable>
```

兼容 `<OTTable name="...">` 和 `<Ledger>`。

## 打开网站（404 就是这一步没做）

1. https://github.com/Wuuule/Wuu-Tavern/settings/pages
2. Source 选 **GitHub Actions**；若没有该选项，选 Deploy from a branch → `main` / `(root)`
3. Save，等两分钟
4. https://wuuule.github.io/Wuu-Tavern/
