# 周数据总看板

这是使用模拟数据的静态演示。运行本地 HTTP 服务后访问 index.html。例如在本目录运行 `python -m http.server 8765`，再打开 `http://localhost:8765/`。

## 发布

1. 在 GitHub 新建公开仓库，将本目录的文件上传到仓库根目录并提交到 main。
2. 打开仓库 Settings → Pages，选择 Deploy from a branch、main、/(root)，然后保存。
3. 等待 Pages 部署完成，从 Pages 设置页打开站点。

## 更新数据

编辑 weekly.json，保留 simulated 为 true。rows 每行代表日期、小组、地区、产品组合的一条汇总。date 用 YYYY-MM-DD，week 用 ISO 周 YYYY-Www。group、region、product 为小组、地区、产品。sales、grossProfit、adSpend 的单位为人民币元。units 为销量，orders 为产品订单数。真实数据若需要跨产品计算去重订单数，应使用订单 ID 或另行计算。毛利率和广告花费占比按筛选后的金额合计除以销售额合计。

公开仓库和 Pages 均可被他人访问，仅提交模拟数据。
