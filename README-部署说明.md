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

## 数据核实状态（2026-09-20 复核）

学费已逐条对照各校官网**项目专属页**核验，卡片按核实程度标注四种徽章：

| 徽章 | 条数 | 含义 |
|------|------|------|
| 学费官网已核 | 104 | 官网项目页明确列出本入学周期费用 |
| 官网按学分计费 | 14 | 官网只给学分/模块单价，未列全程总额；**不再保留推算总额**，只记官网单价 |
| 官网仅列其他入学周期 | 2 | 官网只有其他届费用（HKUST-NYU Stern 全球金融 2026 年 11 月入学、HKU 金融科技与数据分析 2026/27），本周期未公布 |
| 学费待核实 | 34 | 本轮未能从官网项目页取到学费原文 |

本轮修正：
- 清除 36 条 `tuitionNote` 占位符 `CORRUPTED_NEEDS_FIX`（曾直接显示在页面与 CSV 导出中）
- 18 条学费数字按官网项目页纠正，例如 HKUST 金融科技 330,000 → **405,000**、CUHK 经济学 280,000 → **358,000**、CUHK 人工智能 280,000 → **395,000**、PolyU 运营管理 295,000 → **369,000**、CUHK 家庭企业管理 320,000 → **468,000**
- 14 条 PolyU 项目删除「按相近系所费率推算」的总额，改记官网学分单价（其中 3 条原先借用其他专业的费率，属臆测）
- HKU 经管学院 12 条学费与官方 Composition Fee 表逐条吻合（来源 masters.hkubs.hku.hk/admissions）

## NUS 核实状态（2026-09-20）

NUS 官网对 `curl` / Node 请求返回 Incapsula 挑战页（955 字节），但**真实浏览器可通过挑战**；通过后可用同源 `fetch` 抓取该项目站各子页（跨子域仍被 CORS 拦截，须逐站导航）。据此已按官网原文核实 8 条：

| 项目 | 官网学费（含 9% GST） | 入学 |
|------|------|------|
| MSc in Finance | S$77,390（税前 S$71,000） | 2027 年 8 月 |
| MSc in Accounting and Financial Analytics | S$77,390（税前 S$71,000） | 2027 年 8 月 |
| MSc in Human Capital Management and Analytics | S$77,390（税前 S$71,000） | 2027 年 8 月 |
| MSc in Marketing Analytics and Insights | S$77,390；双学位含 CEMS S$91,560 | 2027 年 8 月 |
| MSc in Real Estate | S$63,983（税前 S$58,700） | 2027 年 8 月 |
| MSc in Strategic Analysis and Innovation | S$77,390（税前 S$71,000） | 2027 年 8 月 |
| MSc in Management | 单学位 S$61,803；双学位 S$75,973 | **2028 年 1 月，无 27 Fall** |
| MSc in Business Analytics | 国际生 S$87,550 / 校友 S$70,040 / 公民及 PR S$52,530 | AY2027/28 |

关键日期（官网原文，除 MSBA 外一致）：2026-09-01 开放、2026-11-15 第一轮截止、2027-02-15 最终截止、2027-06 前发榜。MSBA 为 2026-10-05 至 2027-01-31。

学费一律记官网新元原文，**不做汇率折算**——折算值属估算，违反「只允许官网来源」。因此这些条目 `tuitionHkd` 为 `null`，志愿单按学费排序时会排在末尾。

英语要求官网原文为 TOEFL iBT「at least 5.0」/ IELTS 7.0。这不是笔误：2026-01 起 TOEFL 改用新分制，港大官网亦写明「4.5+ from 21 Jan 2026」。

## 待处理的数据问题

| 问题 | 规模 | 说明 |
|------|------|------|
| NUS 6 条未出现在商学院官方硕士名单 | 可持续绿色金融、MFE、经济学、供应链管理、数字金融科技、创业学 | 其中 3 条 `website` 仍是大学首页；须定位项目自身官网页，否则按宁缺毋滥删条 |
| NUS Strategic Analysis and Innovation 的入学要求/课程页 | 1 条 | 该项目站路径与其他 NUS MSc 站不同，本轮未取到 |
| NTU 项目页 URL 路径 404 | NTU 10 条 | 须换成官网现行路径并逐项对照（学费为新元，须记原文） |
| `hku-mscact` 名实不符 | 1 条 | `website` 指向 mstat.cds.hku.hk，该站是统计学硕士而非精算 |
| `cuhk-mscqe` 疑似重复 | 1 条 | CUHK 研究生院与工商管理学院官网均查无此项目，疑与 MSc in Economics 重复 |
| `hkust-mscenvsc` 名实不符 | 1 条 | 条目名与原官网页内容（Financial Mathematics）不一致，且页面不可达 |
| 港校项目页 404 或连接失败 | CUHK 2、HKUST 3、CityU 2 | 须重新定位项目页 |
| 学费未能核实 | 26 条 | 卡片标注「学费待核实」 |

## 已移除的功能

「刷新 27 Fall 状态」按钮已于 2026-09-20 移除。原实现并不联网，只是按硬编码规则推断，
且会把 HKU/CityU 的精确申请窗口覆盖成笼统文案（实测一次误报 53 处「变化」）。
本站为 GitHub Pages 静态部署，浏览器端无法跨域抓取各校官网（仅 PolyU、XJTLU 返回 CORS 头，
NUS 另有 WAF 屏蔽非浏览器请求），因此真实的联网重查在当前架构下不可实现，按「不能真实实现就不要」的原则删除。
招生状态以 `data.js` 中经官网核实的记录为准，更新方式为重新采集数据并提交。

## 免责声明

本信息库为申请辅助工具，数据来自各校官网公开页面整理。学费、截止日期与开放状态可能随时调整，请以各大学官网最新公告为准。
