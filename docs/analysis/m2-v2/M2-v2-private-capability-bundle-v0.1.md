# M2 v2 私有能力包操作合同 v0.1

## 目的

该工具用于在多台电脑之间恢复 `m2-pr7-s1` 所需的最小 private evidence closure，避免缺少 `s1-source-evidence-authenticity-private-v0.1.json` 时误以为整个项目无法开发。

普通 clone、安装、lint、build、公开/合成测试、smoke 和 fixture 启动始终不依赖本能力包。缺包只阻断 `m2-pr7-s1` capability；能力包存在或恢复成功不授予任何 batch、provider、数据库、Canary/full160、训练、holdout、B8、merge、release 或 M3 formal 权限。B4 的 2026-07-23 授权来自用户的独立明确指令，与能力包是否存在无关。

## 固定内容

`m2-pr7-s1` 包只包含 9 个 private 文件：

- `s1-source-evidence-authenticity-private-v0.1.json`；
- 它引用的 4 个 report；
- 它引用的 4 个原始 receipt。

包内 manifest 记录 capability ID、source commit、tracked source-evidence binding、逐文件 repository-relative path、role、source identity、size、SHA-256 和 exact-set digest。包明确声明：

```text
environmentIncluded=false
providerCredentialsIncluded=false
databaseCredentialsIncluded=false
providerRequestDelta=0
databaseConnections=0
```

禁止加入 `.env.local`、API key、数据库凭据/连接串、原始账单/台账、数据库 dump、Cookie、Authorization header、Git stash 或 Git object。

## 授权电脑构建

前提：

- 当前分支 HEAD 已推送且等于 upstream；
- tracked worktree 干净；
- 当前 batch 已被单独明确授权，并显式传入；
- S1 canonical doctor 能在该 exact HEAD 重新验证 4 组底层 report/receipt；
- 7-Zip 可用；
- archive 输出目录与 recovery key 目录均在仓库外，且彼此不重叠。

示例：

```powershell
npm run m2:v2:private-capability:build -- `
  -BatchId B3 `
  -OutputDirectory D:\secure-transfer\archives `
  -RecoveryKeyDirectory E:\separate-key-channel
```

`B3` 仅是已完成 checkpoint 的历史示例，不表示可以据此启动任何后续 batch。构建器先执行带 `--expected-head` 和 `--batch-id` 的 S1 doctor，再生成 AES-256 header-encrypted archive、外层 SHA-256 sidecar、脱敏 transport receipt 和单独 recovery key。密码不进入进程参数，也不打印到标准输出。

archive 与 recovery key 必须通过两个独立渠道传输；工具只能验证目录分离，不能替操作人声明已完成分渠道传输。

## 新电脑恢复

先把代码同步到构建 manifest 中的同一 exact commit，并保持 tracked worktree 干净：

```powershell
git fetch origin --prune
git switch codex/m2-v2-evidence-pilot-v1
git pull --ff-only origin codex/m2-v2-evidence-pilot-v1
npm ci
npm run doctor:dev
```

校验外层 archive：

```powershell
npm run m2:v2:private-capability:verify -- `
  -ArchivePath D:\incoming\m2-pr7-s1-private-YYYYMMDD-<commit>.7z
```

恢复：

```powershell
npm run m2:v2:private-capability:restore -- `
  -ArchivePath D:\incoming\m2-pr7-s1-private-YYYYMMDD-<commit>.7z `
  -TargetRepoRoot D:\project\system
```

恢复器交互读取密码，先检查 archive member 路径，再在临时目录解密。Node verifier 随后重新检查 exact-set、摘要、source identity、tracked manifest binding、Git ignore/untracked 边界和目标 exact HEAD。已有不同内容时默认停止；只有操作者明确确认要用已验证包覆盖时才添加 `-Force`。promotion 失败会回滚已经移动的文件并在 ignored private output 中写脱敏 receipt。

恢复完成后仍需运行：

```powershell
npm run doctor:capability -- m2-pr7-s1
npm run m2:v2:pr7:s1:doctor -- --expected-head=<exact-head> --batch-id=<explicitly-authorized-batch>
```

第一条只盘点最小角色；第二条才是真实性判定。两者都不扩大执行授权。

## 与旧迁移工具的关系

`build_m2_v2_private_state_migration.ps1` 等旧工具会迁移 `m2-v2-evidence-pilot/**` 并筛选部分 provider 环境变量，属于历史 provider-state 迁移能力。它不覆盖完整 S1 evidence closure，也不应再作为 provider-free S1 协作的默认入口。

当前默认入口是：

- `build_development_private_capability_bundle.ps1`
- `verify_development_private_capability_bundle.ps1`
- `restore_development_private_capability_bundle.ps1`
- `prepare_development_private_capability_bundle.mjs`
- `apply_development_private_capability_bundle.mjs`

后续如需迁移 current-state、algorithm-input 或其他 private role，应新建明确的 capability policy 和最小闭包，不得把旧工具扩展成无边界的“全量 private 目录打包器”。
