# 港五 + 新二 + 中外合办 商科授课硕士信息库

## 线上地址（两处部署，内容相同，能力不同）

| 站点 | 地址 | 在线保存 | 说明 |
|------|------|----------|------|
| **Qoder 站点** | https://hk5-masters-guide-kxanr44c725.qoder.zone | **支持**（登录 Qoder 账号后） | 国内直连较快，公开可浏览；跟进数据存云端数据库 |
| GitHub Pages | https://ghostllc.github.io/hk5-masters-guide/ | 不支持（纯静态，无后端） | 数据只存在当前浏览器，可用导出/导入 JSON 迁移 |

两个站点跑的是同一份前端代码。`store.js` 启动时探测 `/functions/v1/app?action=me`：拿到 JSON 就认为有后端，拿到 HTML 404 或请求发不出就降级为纯本地模式，并在页面顶部同步条上如实说明当前是哪种。**不需要为两个环境维护两份代码。**

## GitHub 仓库

https://github.com/ghostLLC/hk5-masters-guide

- 分支：master
- GitHub Pages 托管：master **根目录**
- 账号：ghostLLC
- 最近一次推送：2026-09-21（新增申请状态跟进表 + 在线保存；此前同日补入港城大东莞计算机科学、回填英文原文、更正港中深 2 条 27 Fall 状态，共 177 项）

## Qoder 站点部署信息（远程开发用）

| 项 | 值 |
|----|-----|
| 站点域名 | `hk5-masters-guide-kxanr44c725.qoder.zone` |
| 访问范围 | public（2026-09-21 经用户明确授权由 private 改为 public） |
| projectId | `01a0c22c-ef5e-773d-aec4-9c4b819015bf` |
| siteId | `01a0c22c-ef61-7429-b0fb-852ec61fb325` |
| 后端能力 | database + functions + storage（status: ready） |
| Function | 逻辑名 `app`，runtime `edge`，authMode `anonymous`，databaseAccess `read_write`，requiredSchemaVersion `1` |
| 数据表 | `app.track_state`（5 列：user_id / wishlist / tracks / version / updated_at） |
| 发布目录 | `web/`（由 `tools/sync-web.mjs` 生成，已 gitignore） |
| Function 目录 | `functions/`（index.ts + adapter.mjs + auth.mjs + handler.mjs） |

`.商科硕士申请信息库.qoder.site` 是 Qoder 工具自有的本地预览描述文件，内嵌冻结的首页快照、每次发布都会过期，且不能用于在别的机器恢复源码，因此已 gitignore；上表中的域名与两个 ID 才是跨机器续用所需的信息。

## 文件说明

| 文件 | 作用 | 是否发布 |
|------|------|----------|
| index.html | 入口页面（界面 + 样式） | 两个站点都发布 |
| data.js | 177 个项目的数据库（学费/简介/要求/官网等） | 两个站点都发布 |
| app.js | 筛选、搜索、志愿单、导出逻辑；末尾暴露 `window.HK5App` 桥接 | 两个站点都发布 |
| store.js | 存储层：本机 localStorage + 云端同步、版本 CAS、冲突裁决、导出导入 | 两个站点都发布 |
| track.js | 申请状态跟进表 UI（视图切换、表格、汇总、跟进表 CSV 导出） | 两个站点都发布 |
| functions/index.ts | Qoder Edge Function 入口（Deno），固定 `@supabase/supabase-js@2.57.4` | 仅 Qoder |
| functions/adapter.mjs | 平台提供的数据库适配器，**逐字复制未改动** | 仅 Qoder |
| functions/auth.mjs | 平台提供的网关身份读取器，**逐字复制未改动** | 仅 Qoder |
| functions/handler.mjs | 业务处理器：`action=me/load/save`，身份与校验都在这一层 | 仅 Qoder |
| tools/sync-web.mjs | 生成 `web/` 发布目录并做发布前自检（文件齐备、无密钥、无内部路径） | 不发布 |
| dev/track-preview/server.mjs | 本地静态服务 + Function 代理 + 合成身份，**不得部署** | 不发布 |
| dev/track-preview/contract-test.mjs | Function 契约测试（42 项：隔离/CAS/校验/错误码/方法约束） | 不发布 |
| .scrape/ | 采集脚本与官网逐字原文存档 | 不发布（gitignore） |
| web/ | Qoder 发布产物 | 不发布（gitignore） |

本地打开方式：直接用浏览器打开 index.html 即可（需同目录下的 data.js、app.js、store.js、track.js）。此时为纯本地模式。
要连本地后端一起测：`node dev/track-preview/server.mjs 8000`，然后开 http://127.0.0.1:8000/ ，
用 `/functions/v1/app?action=me&fixture=A`（或 B / anonymous / dberror）切换测试身份。

## 数据范围（177 项 · 12 所院校）

| 学校 | 数量 |
|------|------|
| 香港大学 HKU | 21 |
| 香港中文大学 CUHK | 20 |
| 香港科技大学 HKUST | 14 |
| 香港城市大学 CityU | 20 |
| 香港理工大学 PolyU | 47 |
| 南洋理工大学 NTU | 10 |
| 新加坡国立大学 NUS | 10 |
| 西交利物浦大学 XJTLU | 17 |
| 香港中文大学（深圳）CUHK-SZ | 6 |
| 香港城市大学（东莞）CityU-DG | 7 |
| 北京师范大学-香港浸会大学联合国际学院 UIC | 3 |
| 香港科技大学（广州）HKUST-GZ | 2 |

口径：商学院及商科交叉的**全日制**授课制硕士；已排除 MBA/EMBA、Executive 系列、兼读制（part-time）、研究型 MRes/MPhil 与博士项目（见 `DATA_META.scopeNote`）。

按用户 2026-09-21 指示，中外合办只做到上述 5 所为止；剩余 6 所（宁波诺丁汉 UNNC、温州肯恩 WKU、昆山杜克 DKU、上海纽约 NYU Shanghai、广东以色列理工 GTIIT、深圳北理莫斯科大学 SMBU）**不再采集**。

## 学费口径

- **身份档位**：按中国大陆（内地申请者）取。官网按身份分档者取内地适用档，如 NUS MSBA 取国际学生档 S$87,550（校友 S$70,040、公民及 PR S$52,530 记入说明）。
- **原币值优先**：港币/新币官网原值始终保留并优先展示，**不做币种互转**（折算即估算）。
- **人民币参考值**：另附 CNY 换算，汇率取自 open.er-api.com（exchangerate-api.com），2026-09-20 更新：1 HKD = 0.856469、1 SGD = 5.266594；换算值取整到百元，页面来源提示条完整披露汇率、日期与来源，并明确标注「非各校官网数字」。
- **按学分计费**（14 条 PolyU）：官网项目页均写明 CREDIT REQUIRED 31，估算总额 = 官网学分单价 × 31，字段 tuitionIsEstimate 标记，徽章为「官网按学分计费·总额为估算」。
- **按模块计费**：现无此类条目。NTU 资产与财富管理（AWM）曾被记为「S$2,800–7,500/模块、不给总额」，复核后发现那是官网另一处的模块单价，官方费用表按身份分三栏，国际学生档为 **S$85,020（含 GST）**，已更正为 `official-page`。`app.js` 仍保留该分支以兼容后续数据。
- **按学期分项**（1 条 NUS MFE）：官网按学期列示（申请费 S$100、入学费 S$12,000、全日制第一学期 S$24,000、第二学期 S$28,000，均含 GST）且无单一总额，本库不自行加总，也不给人民币参考换算。
- **按学年计费**（7 条港城大东莞）：官网以「元/生/学年」计且未列全程总额，保留学年单价原值（`tuitionRmbPerYear`），另按官网学制 2 年估算总额并标注 `tuitionIsEstimate`，避免学年费与其他院校全程学费混排导致排序失真。
- **人民币计价院校**（XJTLU、港中深、港科广、北师港浸大、港城大东莞）：学费本身即人民币，`tuitionCny` 直接等于官网值而**非汇率换算**，界面显示 ¥ 原值且不附加换算后缀。
- **待审批**（1 条港中深 IMBA）：中文页原文「学费：288,000（CYN）待审批」，英文页把同一数额归为「(2024 entry) RMB 288,000」，两处均非 2027 年入学，故不填数值字段，仅照录原文并挂「官网学费待审批」徽章。
- **官网自相矛盾时**：以更新的官方页面为准并在字段中同时披露两处原文。例如港中深市场学的 `/en/admission` 页仍写「(2025 entry) RMB 267,000」，而 2026-08-20 发布的 2027 招生新闻页明确「学费（2027 入学）RMB 297,000」，本库取后者。港城大东莞创新创业页官网原文写「一周内」支付定金、其余 6 个项目页写「四周内」，属官网自身不一致，照录不改。

## 数据质量说明

- 港五：多数项目学费、开放状态、中英简介已按官网下钻核实；36 条 `tuitionNote` 占位符 `CORRUPTED_NEEDS_FIX` 已全部清除（现残留 0 条）
- NTU：库内 10 条的项目页 URL **实测全部返回 200，可正常访问**（形如 `ntu.edu.sg/business/admissions/graduate-studies/<项目>`）。学费正文在各项目页的 `/home` 等子页上，主页面本身不含金额，因此需要在子页提取。（更正：本文件与 `9364669`、`05a060b` 两次提交信息中曾写「NTU 10 条项目页 URL 全部 404」，那是误用了我自己猜测的 `ntu.edu.sg/nbs/graduate/...` 路径测出的结果，并非库内地址，结论有误，特此更正。）
- NUS：`curl`/Node 请求被 Incapsula WAF 拦截（返回 955 字节挑战页），**真实浏览器可通过挑战**取到官网正文；已按官网原文核实 10 条（见下方 NUS 核实状态表），原「8 条申请要求是二手信息」的问题已清零（现残留 0 条），另 4 条无法在官网定位到项目自身页面的已删除并记录在 `DATA_META.removedEntries`
- 中外合办 5 所：XJTLU 17 条、港中深 6 条、港科广 2 条、港城莞 7 条、北师港浸大 3 条，均已浏览器实抓项目自身官网页；英文简介与英文入学要求原文已全部回填（现全库 `descEn` / `requirementsEn` 无「待补」占位）
- 投递前务必再点专业名跳转官网，确认学费、截止日期与语言要求

采集环境备忘（2026-09-21 实测）：出口 IP 在新加坡时 NUS/NTU/港五均可达；`www.nottingham.edu.cn` 用 `curl` 会因 Windows Schannel 握手失败，改用 Node `fetch` 或浏览器即可；`www.dku.edu.cn` 返回 503，需浏览器复测。中外合办院校站点（XJTLU、港中深各子站、港科广、港城莞、北师港浸大）**均为 JS 渲染**，静态抓取正文为空，必须用真实浏览器；港中深 6 个项目各有独立子域（msfin / msecon / msacct / mscds / mscmkt / msimba.cuhk.edu.cn），**跨子域 `fetch` 被 CORS 拦截**，须逐子域导航后同源抓取。

## 如何更新并重新上线

本目录已于 2026-09-20 绑定 GitHub 仓库（分支 master）。**两个站点要分别发布，改完代码后两边都要走一遍。**

### 1. GitHub Pages（静态，无在线保存）

```
git add index.html data.js app.js store.js track.js functions tools dev README-部署说明.md 开发要求与逻辑总结.md
git commit -m "更新说明"
git push
```

Pages 自动重建，一般 1–3 分钟生效。验证：

```
curl -s https://ghostllc.github.io/hk5-masters-guide/data.js | head -2
```

`functions/`、`tools/`、`dev/` 会一并进入仓库（用户要求代码/文档都上传），GitHub Pages 也会把它们当静态文件挂在同路径下，但**不会执行**——Pages 没有 Edge Function 运行时，`/functions/v1/app` 返回 HTML 404，前端据此降级为纯本地模式。这些文件不含任何密钥。

### 2. Qoder 站点（含在线保存）

必须用 Qoder 的 sites 工具链，`git push` 不会触发它重新发布：

1. `node tools/sync-web.mjs` —— 重新生成 `web/` 发布目录（含发布前自检：5 个文件齐备、脚本引用完整、不含平台密钥与内部路径）
2. 用新的 `actionId` 调 `prepare_site`，参数：`projectRoot` = 本目录、`webDirectory` = `web`、`functionDirectory` = `functions`、`projectId` = `01a0c22c-ef5e-773d-aec4-9c4b819015bf`、`databaseAccess` = `read_write`、`requiredSchemaVersion` = `1`、`spa` = false
   - 若返回 `descriptorStatus: pending`，等 `verificationOperationId` 的 operation 变成 succeeded 后，**用同一个 actionId 和完全相同的入参重试一次**即可变成 `written`
3. `get_publish_status` 确认 `canPublish: true`，再 `publish_site`
4. 轮询 `publishOperationId` 到 `state: succeeded` 且 `committed: true`，然后 `get_publish_status` 确认 `published: true`
5. 验证运行时（预览画布不执行 Function，必须单独验）：
   ```
   curl -s https://hk5-masters-guide-kxanr44c725.qoder.zone/functions/v1/app?action=me
   # 期望 {"backend":"ok","user":null}
   curl -s -o /dev/null -w "%{http_code}\n" https://hk5-masters-guide-kxanr44c725.qoder.zone/functions/v1/app?action=load
   # 期望 401（未登录），证明 requireUser 生效
   ```
   再逐个比对线上 5 个静态文件与本地的 sha256（`index.html` 会因平台注入水印脚本而不同，属正常）

### 3. 数据库结构变更

只能通过 sites-management 的迁移工具做，不能在 Function 里执行 DDL。步骤：`get_database` 读当前 `schema_version` 与 `schema_fingerprint` → `create_database_migration`（受限 DDL 子集 + 声明式 `accessPolicies`）→ 核对返回的 normalized SQL → `apply_database_migration` → 轮询 operation → `refresh_database` → `list_database_tables` 核对列数。改完后 `prepare_site` 的 `requiredSchemaVersion` 要同步更新为新的版本号。

有版本在线上时按 expand-and-contract 做：先加兼容的表/可空列，保持旧 Function 可用，再发布使用新结构的 Function。

若需在其他机器重新绑定 GitHub：

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

### 浏览选校

- 按学校 / 方向 / 27 Fall 状态筛选
- 关键词搜索（中英文名、学院、中英简介、申请要求、学费说明等；空格分隔多关键词需全部命中）
- 志愿单：加入、排序、搜索、导出 CSV / JSON
- 点专业中文名或英文名 → 新标签页打开该项目官网
- 中英双语简介与申请要求展示（卡片摘要 + 展开四段对照，多段官网原文按行渲染）
- 核实状态可见：卡片徽章区分「官网名单已核 / 待官网核实」「学费官网已核 / 按学分计费·总额为估算 / 按学年计费·总额为估算 / 仅列其他入学周期 / 学费待审批 / 学费待核实」「申请要求非官网原文·无中文」；页面顶部来源提示条给出各类计数、汇率来源与身份档位
- CSV 导出 23 列，含学费原币值与人民币参考值、是否估算总额、中英申请要求及其核实状态

### 申请跟进（顶部「申请跟进」标签）

以志愿单为行来源——加入志愿的项目自动出现在跟进表里，移出志愿单后跟进记录仍保留（会标注「已不在志愿单」）。每行可记录：

| 字段 | 取值 |
|------|------|
| 优先级 | 未定 / 冲 / 稳 / 保 |
| 申请状态 | 未开始 / 准备材料 / 已提交 / 面试中 / 已获 Offer / 已接受 / 已拒 / 已放弃 |
| 四个日期 | 截止日期、提交日期、面试日期、出结果日期 |
| 材料清单 | 成绩单、学位/在读、语言成绩、推荐信、个人陈述、简历、其他（7 项勾选） |
| 备注 | 自由文本，上限 2000 字符 |

- 顶部汇总条按状态计数，并单独提示「N 天内截止」与「已过期未提交」
- 截止日期在 14 天内且尚未提交 → 整行标黄并显示「剩 N 天」；已过期未提交 → 标红
- 已提交之后的状态（含 Offer/已拒）不再告警，只显示「已于 X 截止」
- 支持按状态筛选，按志愿单顺序 / 截止日期 / 申请状态排序
- 跟进表可单独导出 CSV（22 列，含全部日期与 7 项材料勾选状态）
- 所有改动即时保存，备注按输入防抖 600ms

### 在线保存

页面顶部同步条实时显示当前存储状态，四种情形措辞不同，不会让人误判数据存在哪里：

| 情形 | 同步条文案 | 可用操作 |
|------|-----------|----------|
| Qoder 站点 + 已登录 | 在线保存已开启 · 账号名 · 云端版本 vN · 上次保存时间 | 立即保存、重新读取云端、导出备份、导入备份 |
| Qoder 站点 + 未登录 | 本机保存 · 登录 Qoder 账号后可开启在线保存 | 导出备份、导入备份 |
| GitHub Pages | 本机保存 · 此站点为静态部署，数据只存在当前浏览器，可用「导出备份 / 导入备份」在设备间迁移 | 导出备份、导入备份 |
| 云端暂时不可用 | 本机保存 · 云端服务暂不可用，改动已留在本机 | 导出备份、导入备份 |

行为约定：

- **GitHub Pages 的控制台会出现一条 404 报错**：`Failed to load resource: 404 (/functions/v1/app?action=me)`。这是后端探测的**预期结果**，不是 bug——前端正是靠这个 404（响应为 HTML 而非 JSON）判定「此站点没有后端」并降级为纯本地模式。探测一个不存在的端点必然产生这条记录，无法消除。除此之外不应有任何控制台报错
- **任何改动先落 localStorage 再推云端**，云端失败绝不丢数据
- 云端保存走**版本化写入**（CAS）：带上 `baseVersion`，服务端按 `user_id + version` 双条件过滤并检查受影响行数；版本不符返回 409 并附云端当前状态，前端弹出让用户选「用本机覆盖云端」或「放弃本机，使用云端」，**绝不静默覆盖**
- 写入结果未知（断网/超时）时**挂起自动保存**，只提示「重新读取云端」做对账，**不自动重放写入**——因为无法判断上一次是否已提交
- 登录后若本机有未同步改动（`dirty` 标记）且云端也有数据，同样走裁决弹窗
- 导出/导入的 JSON 带 `kind` 与 `schema` 标识，导入非本站文件会被拒绝

## 数据核实状态（2026-09-21 复核）

学费已逐条对照各校官网**项目专属页**核验，卡片按核实程度标注徽章，页面顶部来源提示条同步披露各类计数：

| 徽章 | 条数 | 含义 |
|------|------|------|
| 学费官网已核 | 139 | 官网项目页明确列出本入学周期费用 |
| 官网按学分计费·总额为估算 | 14 | PolyU：官网只给学分单价，总额 = 单价 × 官网最低毕业学分 31 |
| 官网按学年计费·总额为估算 | 7 | 港城大东莞：官网只给学年单价，总额 = 单价 × 官网学制 2 年 |
| 官网仅列其他入学周期 | 3 | HKU 金融科技与数据分析（2026/27）、HKUST 科大-纽大全球金融（2026 年 11 月入学）、港中深数据科学（官网中英两版均写 2026 年 / 2026 Intake，31.8 万 / RMB 318,000） |
| 官网按学期分项列示 | 1 | NUS MFE：官网按学期列示且无单一总额，不自行加总 |
| 官网学费待审批 | 1 | 港中深 IMBA：中文页「288,000（CYN）待审批」，英文页归为 2024 entry |
| 学费待核实 | 12 | 未能从官网项目页取到学费原文，全部为港五条目 |
| 申请要求非官网原文·无中文 | 34 | 早期采集的压缩改写文本，非官网逐字原文且无中文对照；HKU 14、CUHK 14、CityU 5、NUS 1。见下方待处理问题与 `开发要求与逻辑总结.md` §十四 |

合计 177 条，每条都有明确的学费核实徽章，不存在「看起来核实过其实没有」的中间态。

项目存在性：156 条已在官网名单确认，21 条待核实（HKU 9、CUHK 5、CityU 3、PolyU 2、HKUST 2，均为港五条目）。

27 Fall 状态：可申请 151 条、待批准/待开放 20 条、未开放 6 条。

申请要求：143 条为官网逐字原文并附中文对照，34 条为早期压缩摘要（已在卡片、展开区、弹窗与 CSV 四处标注，不会被误读为已核实）。

本轮（2026-09-21）修正：
- 港中深**市场学**：官网 2026-08-20 发布的 2027 招生新闻页首次公布 2027 入学学费 RMB 297,000、全日制 2 年、36 学分及四轮截止日期，据此 `open27` 由 pending 改为 true、学费由空值补为 297,000、`feeSource` 由 official-other-intake 改为 official-page
- 港中深**数据科学**：官网中文首页明确列出「2027年秋季入学研究生申请」第一轮 2026-08-26 至 2026-11-30，`open27` 由 pending 改为 true；学制按英文原文补为 2 年。学费仍不填（官网中英两版标注的均是 2026 年入学）
- 港中深**经济学**：`foundedYear` 补为 2017（官网英文原文 "was established in 2017"、中文「自 2017 年创办以来」）；申请窗口按中文页精确到 2026-08-24 开启、2027-05-31 截止，并披露英文页 Deadline 表落后一年（1/9/2025–31/5/2026）
- 港城大东莞**商务资讯系统**：`jointPartner` 补为复旦大学（官网原文：作为与复旦大学联合培养计划的一部分，BIS-FIT 方向的学生将在复旦大学完成第二学年的学习）
- 港城大东莞 3 条（商业及数据分析、工程管理学、人工智能）此前标注「入学条件栏正文未取到、不得套用其他项目要求」，本轮已逐字取到，确认与其余 4 个项目页完全一致且无项目专属附加要求，占位说明已解除
- 全库 `descEn` / `requirementsEn` 的「待补」占位清零（西浦 17 条、港中深 6 条、港城莞 7 条本轮补齐）

上一轮（2026-09-20）修正：
- 清除 36 条 `tuitionNote` 占位符 `CORRUPTED_NEEDS_FIX`（曾直接显示在页面与 CSV 导出中）
- 18 条学费数字按官网项目页纠正，例如 HKUST 金融科技 330,000 → **405,000**、CUHK 经济学 280,000 → **358,000**、CUHK 人工智能 280,000 → **395,000**、PolyU 运营管理 295,000 → **369,000**、CUHK 家庭企业管理 320,000 → **468,000**
- 14 条 PolyU 项目删除「按相近系所费率推算」的总额，改记官网学分单价（其中 3 条原先借用其他专业的费率，属臆测）
- HKU 经管学院 12 条学费与官方 Composition Fee 表逐条吻合（来源 masters.hkubs.hku.hk/admissions）
- NTU 资产与财富管理：曾误记「按模块 S$2,800–7,500/模块」，实为官网另一处的模块单价；官网费用表按身份分三栏，国际学生档为 **S$85,020（含 GST）**，已更正

## NUS 核实状态（2026-09-20）

NUS 官网对 `curl` / Node 请求返回 Incapsula 挑战页（955 字节），但**真实浏览器可通过挑战**；通过后可用同源 `fetch` 抓取该项目站各子页（跨子域仍被 CORS 拦截，须逐站导航）。据此已按官网原文核实 10 条（含可持续与绿色金融、MFE 两个非商学院系列项目）：

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
| MSc in Sustainable and Green Finance | S$73,030（税前 S$67,000） | 2027 年 8 月 |
| Master of Financial Engineering (MFE) | 官网按学期分项，无单一总额 | 见官网 |

关键日期（官网原文，除 MSBA 外一致）：2026-09-01 开放、2026-11-15 第一轮截止、2027-02-15 最终截止、2027-06 前发榜。MSBA 为 2026-10-05 至 2027-01-31。

学费一律记官网新元原文（`tuitionSgd`），`tuitionHkd` 为 `null`；另按 2026-09-20 汇率附人民币参考值（`tuitionCny`），界面显示为「S$87,550 ≈ ¥461,100」，来源提示条与 CSV 表头均标注该值为参考换算、非官网数字。志愿单「按学费排序」使用人民币参考值，因此新元条目可与其他院校同序比较。MFE 因官网按学期分项且无单一总额，不给参考换算。

英语要求官网原文为 TOEFL iBT「at least 5.0」/ IELTS 7.0。这不是笔误：2026-01 起 TOEFL 改用新分制，港大官网亦写明「4.5+ from 21 Jan 2026」。

## 待处理的数据问题

上一版此节列出的 8 项问题中，「NUS 6 条未出现在商学院官方名单」「NUS Strategic Analysis and Innovation 入学要求页未取到」「NTU 项目页 URL 404」「`hku-mscact` 名实不符」「`cuhk-mscqe` 疑似重复」「`hkust-mscenvsc` 名实不符」「港校项目页 404 或连接失败」均已处理完毕：能重新定位到官网项目页的已核实入库（如 NUS Strategic Analysis and Innovation 现为 `mscstrategy.nus.edu.sg`，学费/入学要求/关键日期均取自官网原文），定位不到的 12 条已按「查不到就删掉」删除，原字段完整保留在 `DATA_META.removedEntries`，可凭 git 历史恢复。

以下是**目前仍然存在、且官网确实未提供**的缺口，已在对应字段中如实标注，不作推算：

| 问题 | 规模 | 说明 |
|------|------|------|
| **中英申请要求字段缺失** | 34 条 | HKU 14、CUHK 14、CityU 5、NUS 1。这些条目只有单一 `requirements` 字段，界面回退后「申请要求 · 中文」栏会显示英文；且现存文本是早期**压缩改写**而非官网逐字原文，同时违反开发要求 §四的两项规定。修法须回官网取逐字原文再翻译，**不得**把改写文本翻译成中文冒充已核实。详见 `开发要求与逻辑总结.md` §十四 |
| 英文简介缺失 | 1 条 | `hku-mieelm`（工业工程与物流管理）有中文简介、无 `descEn` |
| 学费未能核实 | 12 条 | 全部为港五条目（HKU 4、PolyU 4、CityU 3、CUHK 1），卡片标注「学费待核实」 |
| 项目存在性待核实 | 21 条 | 全部为港五条目（HKU 9、CUHK 5、CityU 3、PolyU 2、HKUST 2） |
| 开办年份缺失 | 中外合办 35 条中的 34 条 | 官网项目页均未设「开办时间/首次招生年份」栏；唯一例外是港中深经济学，可依官网英文原文 "was established in 2017" 填 2017。其余按「不推算」原则一律留空 |
| 港中深数据科学 2027 学费 | 1 条 | 官网中文页写「31.8万人民币（2026年）」、英文页写「for 2026 Intake」，2027 年入学学费未公布 |
| 港中深 IMBA 学费 | 1 条 | 中文页「288,000（CYN）待审批」、英文页归为 2024 entry，均非 2027 年 |
| 港科广 2027/28 申请轮次 | 2 条 | 研究生院目录的 yearOfEntry 筛选项含 Prospective Year 2027/28，但项目详情仍显示 2026/27；学费本身已核实（RMB 260,000 / 398,000） |
| 北师港浸大 2027-28 学费与轮次 | 3 条 | 官网学费标注适用学年为 2026-27 入学（RMB 280,000 / 170,000 / 170,000），2027-28 未公布 |
| 港城大东莞 2027 申请轮次 | 7 条 | 官网 7 个项目页的申请时间轴均对应 2026 年入学（截止 2026-07-31、开课 2026-08-31），2027 年入学安排未公布 |
| 西浦 3 条 27 Fall 状态 | 3 条 | 数据科学、创新创业、数字商业官网标注为待开放/待批准 |

以上均已在卡片徽章、`tuitionNote`、`applyWindow`、`sourceNote` 中逐项披露，读者可直接看出哪些是官网原话、哪些是本库标注。

## 已移除的功能

「刷新 27 Fall 状态」按钮已于 2026-09-20 移除。原实现并不联网，只是按硬编码规则推断，
且会把 HKU/CityU 的精确申请窗口覆盖成笼统文案（实测一次误报 53 处「变化」）。
本站为 GitHub Pages 静态部署，浏览器端无法跨域抓取各校官网（仅 PolyU、XJTLU 返回 CORS 头，
NUS 另有 WAF 屏蔽非浏览器请求），因此真实的联网重查在当前架构下不可实现，按「不能真实实现就不要」的原则删除。
招生状态以 `data.js` 中经官网核实的记录为准，更新方式为重新采集数据并提交。

## 在线保存的安全边界（务必读）

申请跟进数据是个人隐私数据。这里如实记录它的保护方式与**已知未验证的边界**，不夸大。

### 隔离是怎么实现的

- 浏览器**不能**指定 `user_id`。身份只来自网关验证过后注入的 `x-qoder-user-context` 请求头，由平台提供的 `functions/auth.mjs`（逐字复制、未改动）解析；网关会先剥掉浏览器自带的任何 `x-qoder-*` 头再注入。`functions/handler.mjs` 用 `requireUser(request)` 取出 `user_id`，**所有数据库查询都带 `.eq('user_id', user.user_id)`**。
- 载荷里塞 `user_id` 字段无效，已在契约测试中验证（B 提交 `user_id: 'fixture-A'`，数据仍落在 B 自己行上，A 的数据未被篡改）。
- 未登录时 `load` / `save` 一律 401 `login_required`，不会退化成匿名读写。

### 已知边界（用户已于 2026-09-21 知情并接受）

**数据库层的行级安全无法按 owner 策略生效。** 平台自带的数据库适配器只支持匿名模式，用 `SUPABASE_ANON_KEY` 做 apikey 与 Bearer 认证，不会把站点登录态翻译成 Supabase 用户，因此 `auth.uid()` 恒为空、`owner` 模板的策略会让 Function 一行都读不到。可用的声明式策略只有 `deny` / `public` / `owner` 三种，于是本表只能用：

```json
[{ "table": "track_state", "principal": "anonymous",
   "actions": ["select","insert","update"], "template": "public" }]
```

含义与后果：

- **跨用户隔离完全由 Function 代码强制**，不是由数据库强制。正常路径下浏览器只能访问同源 `/functions/v1/app`，无法直连数据库，因此隔离是有效的。
- 但「绕过 Function 直连数据库」的隔离性，平台文档明确标注为**未验证**：站点源上 `/rest/v1` 被拒只证明那条路由关了，前端产物里没有凭证只证明产物没暴露凭证，两者都不等于证明了 provider 直连与备用入口的隔离。
- 平台规范本身写明「不得把私有数据设计改成 anonymous + public CRUD 当作生产方案」。这里是用户在了解上述边界后明确选择的方案（三个选项中的「公开站点 + 登录隔离」），属于**有限功能验证范围**，不是生产级安全保证。
- 授权范围已按最小化：只给 `select` / `insert` / `update`，**没有给 `delete`**（清空通过写入空载荷实现）。

如果日后要收紧：把 `accessPolicies` 换成 `deny` 表清除标记即可撤销全部托管授权（表与数据保留），代价是在线保存失效、退回纯本地 + 导入导出。

### 其他防护措施

| 面 | 做法 |
|----|------|
| 写入校验 | 服务端白名单：状态/优先级枚举、项目 id 正则、日期 `YYYY-MM-DD`、材料键固定 7 个且强制布尔、备注 ≤2000 字符、志愿 ≤200 条、跟进 ≤200 条、请求体 ≤256KB（按实际流过的字节计数，不信 `Content-Length`） |
| 错误信息 | 只回固定应用错误码（`invalid_input` / `conflict` / `login_required` / `write_rejected` / `write_result_unknown` / `state_unavailable`），**绝不回传 SQL、键值、路由头或原始 provider 报错** |
| 方法约束 | GET 不改状态；`save` 只接受 POST、`load` 只接受 GET，其余 405；未知 action 404 |
| 密钥 | `functions/` 与 `web/` 内无任何硬编码凭证；数据库凭证由平台注入，不进 `secretNames`、不进源码、不进前端；`tools/sync-web.mjs` 发布前会扫一遍 `SUPABASE_*` / `QODER_PAT` / `DATABASE_URL` / JWT 前缀 |
| XSS | 所有数据插值经 `esc()`（`& < > " '`）；专业名链接只允许 http(s)，其余降级为纯文本；对账弹窗改用 DOM API + `textContent` 构建，不走 `innerHTML`。已用 `<img src=x onerror=...>` 与 `javascript:` URL 实测：注入标记以转义文本呈现、页面 `img` 数为 0、回调未触发、`h3` 降级为 `span` |
| 平台文件 | `functions/adapter.mjs` 与 `functions/auth.mjs` 逐字复制平台资产、未改动（已 `diff` 校验） |
| 本地测试件 | `dev/` 下的 fixture 服务与合成身份**不进发布包**，生产端点没有 fixture 开关 |

### 验证到什么程度（区分清楚，不含糊）

**已验证**

- 本地：Function 契约测试 42 项全通过（身份/匿名、方法与路由约束、首次写入与读回、版本 CAS、跨用户隔离、输入校验白名单、材料键白名单、数据库故障错误码）。命令：`node dev/track-preview/server.mjs 8000` 后 `node dev/track-preview/contract-test.mjs`
- 本地：前端云端全流程（首存、刷新读回、改动自动保存并版本 +1、双身份互不可见、冲突弹窗两种选择、导出导入往返、`file://` 与静态托管降级）
- 线上：`published: true` 且 release 一致；Function `is_active`、`database_access: read_write`、`required_schema_version: 1`；数据表 `track_state` 5 列经目录核对；匿名 `?action=me` 返回 `{"backend":"ok","user":null}`；匿名 `?action=load` 返回 401；未知 action 404；GET `save` 405；线上 4 个 JS 与本地 sha256 完全一致（`index.html` 因平台注入水印脚本而不同）；页面渲染 177 张卡片、无控制台报错，同步条正确显示「登录 Qoder 账号后可开启在线保存」而非静态站点文案

**未验证**：真实网关身份注入后的**登录态读写往返**。这一步需要用户本人登录 Qoder 账号，我无法代替（浏览器里没有会话，访问会撞登录门）。本地那套是 fixture，能证明应用逻辑正确，**不能证明真实网关与真实数据库往返**。

## 免责声明

本信息库为申请辅助工具，数据来自各校官网公开页面整理。学费、截止日期与开放状态可能随时调整，请以各大学官网最新公告为准。
