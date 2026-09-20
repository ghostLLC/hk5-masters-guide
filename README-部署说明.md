# 港五新二 商科授课硕士信息库

## 线上地址

https://ghostllc.github.io/hk5-masters-guide/

## GitHub 仓库

https://github.com/ghostLLC/hk5-masters-guide

- 分支：master
- 托管：GitHub Pages（master 根目录）
- 账号：ghostLLC
- 最近一次推送：2026-09-17（新增 NUS/NTU，共 154 项）

## 文件说明

| 文件 | 作用 |
|------|------|
| index.html | 入口页面（界面 + 样式） |
| data.js | 154 个项目的数据库（学费/简介/要求/官网等） |
| app.js | 筛选、搜索、志愿单、导出逻辑 |

本地打开方式：直接用浏览器打开 index.html 即可（需同目录下的 data.js 与 app.js）。

## 数据范围（154 项）

| 学校 | 数量 |
|------|------|
| 香港大学 HKU | 22 |
| 香港中文大学 CUHK | 22 |
| 香港科技大学 HKUST | 17 |
| 香港城市大学 CityU | 22 |
| 香港理工大学 PolyU | 47 |
| 南洋理工大学 NTU | 10 |
| 新加坡国立大学 NUS | 14 |

口径：商学院及商科交叉授课硕士；已排除 MBA/EMBA（港五与新二一致）。

## 数据质量说明

- 港五：多数项目学费、开放状态、中英简介已按官网下钻核实；但 36 条 `tuitionNote` 仍是占位符（见下方已知问题）
- NTU：学费与简介来自 ntu.edu.sg 官网抓取（新元，多含 GST）；但当前记录的 10 个项目页 URL 已 404，需换成官网现行路径
- NUS：`curl`/Node 请求被 Incapsula WAF 拦截（返回 955 字节挑战页），**真实浏览器可通过挑战**取到官网正文；本轮尚未逐页抓取，14 条简介/学费仍标注「待核实」，其中 8 条申请要求是二手信息、须替换
- 投递前务必再点专业名跳转官网，确认学费、截止日期与语言要求

采集环境备忘（2026-09-20 实测）：出口 IP 在新加坡时 NUS/NTU/港五均可达；`www.nottingham.edu.cn` 用 `curl` 会因 Windows Schannel 握手失败，改用 Node `fetch` 或浏览器即可；`www.dku.edu.cn` 返回 503，需浏览器复测。

## 如何更新并重新上线

本目录已于 2026-09-20 绑定同一仓库（分支 master），日常更新流程：

```
git add index.html data.js app.js README-部署说明.md
git commit -m "更新说明"
git push
```

GitHub Pages 会自动重新构建，一般 1–3 分钟后生效。

若需在其他机器重新绑定：

```
git init -b master
git remote add origin https://github.com/ghostLLC/hk5-masters-guide.git
git fetch origin
git reset --soft origin/master
git add -A
git commit -m "sync"
git push -u origin master
```

## 功能

- 按学校 / 方向 / 27 Fall 状态筛选
- 关键词搜索（中英文名、学院、中英简介、申请要求、学费说明等；空格分隔多关键词需全部命中）
- 志愿单：加入、排序、搜索、导出 CSV / JSON
- 点专业中文名或英文名 → 新标签页打开该项目官网
- 中英双语简介与申请要求展示（卡片摘要 + 展开四段对照）

## 已知数据问题（修复中）

| 问题 | 规模 | 状态 |
|------|------|------|
| `tuitionNote` 为占位符 `CORRUPTED_NEEDS_FIX` | 港五 36 条（HKU 5 / CUHK 7 / HKUST 7 / CityU 5 / PolyU 12） | 待按官网重写；学费数字本身仍在 |
| `requirementsCn` 含「二手信息」表述，违反「只允许官网来源」 | NUS 8 条、NTU 1 条 | 待用官网原文替换 |
| NUS 全部 14 条简介/学费未取到官网正文 | NUS 14 条 | 待用浏览器逐页抓取（curl 被 Incapsula 拦截） |
| NTU 项目页 URL 路径失效（404） | NTU 10 条 | 待修正为官网现行路径 |

## 已移除的功能

「刷新 27 Fall 状态」按钮已于 2026-09-20 移除。原实现并不联网，只是按硬编码规则推断，
且会把 HKU/CityU 的精确申请窗口覆盖成笼统文案（实测一次误报 53 处「变化」）。
本站为 GitHub Pages 静态部署，浏览器端无法跨域抓取各校官网（仅 PolyU、XJTLU 返回 CORS 头，
NUS 另有 WAF 屏蔽非浏览器请求），因此真实的联网重查在当前架构下不可实现，按「不能真实实现就不要」的原则删除。
招生状态以 `data.js` 中经官网核实的记录为准，更新方式为重新采集数据并提交。

## 免责声明

本信息库为申请辅助工具，数据来自各校官网公开页面整理。学费、截止日期与开放状态可能随时调整，请以各大学官网最新公告为准。
