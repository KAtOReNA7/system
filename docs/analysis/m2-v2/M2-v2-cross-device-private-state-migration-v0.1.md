# M2 v2 跨电脑 Private State 迁移方案 v0.1

## 结论

Git 只承载代码、测试、脱敏报告和公共配置。M2 v2 evidence pilot 的本地状态必须通过独立的 AES-256 加密包人工迁移；恢复工具不会运行 evidence query、full 160、模型训练或任何正式发布动作。

## 最小迁移范围

加密包只允许包含：

- 从 `.env.local` 过滤出的 7 个 M2 v2 evidence provider 变量；
- `data/private-output/m2-v2-evidence-pilot/**`；
- private manifest、SHA-256、恢复所需的只读说明和工具副本。

禁止包含：

- 其他 `.env.local` 数据库账号或密码；
- `data/private-input/**`；
- 与 M2 v2 evidence pilot 无关的 private output；
- 数据库 dump、原始账单、台账或历史工作簿；
- 指向仓库外缓存或依赖目录的 symlink、junction 和其他 reparse point；
- Git object、stash、浏览器状态、Cookie 或 Authorization header。

## 加密与密钥边界

- 格式：7z；
- 内容加密：AES-256；
- 文件名/header 加密：开启；
- 密码通过标准输入传给 7-Zip，不进入进程参数、日志、receipt 或 Git；
- recovery key 文件必须位于仓库和迁移包目录之外，并与加密包分开传输；
- 迁移包、sidecar、receipt 和 recovery key 均不得放入仓库目录。

自动化恢复测试只允许在系统临时目录下的固定验证目标使用进程级临时环境变量；正式仓库恢复不开放该通道，仍必须使用 `Read-Host -AsSecureString`。

## 新电脑恢复

先从远端恢复公共状态：

```powershell
git clone <repository-url> <repo-path>
Set-Location <repo-path>
git switch codex/m2-v2-evidence-pilot-v1
git pull --ff-only origin codex/m2-v2-evidence-pilot-v1
npm ci
```

先验证加密包的外层 SHA-256：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/m2-v2-evidence-pilot/verify_m2_v2_private_state_migration.ps1 `
  -ArchivePath <archive-path>
```

再执行恢复。脚本会在 PowerShell 安全提示中读取密码，不回显：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/m2-v2-evidence-pilot/restore_m2_v2_private_state_migration.ps1 `
  -ArchivePath <archive-path> `
  -TargetRepoRoot <repo-path>
```

恢复脚本会：

1. 校验外层 SHA-256；
2. 解密到临时目录；
3. 校验 private manifest 中每个文件的大小和 SHA-256；
4. 拒绝路径穿越和迁移范围外文件；
5. 只合并 7 个受管环境变量，保留目标电脑其他本地变量；
6. 恢复 evidence pilot private state；
7. 证明 `.env.local` 和 private state 未被 Git 跟踪；
8. 清理临时明文目录。

目标电脑已有 private evidence state 时，脚本默认停止。只有明确使用 `-Force` 才会将现有目录改名备份后恢复，不会静默删除。

## 恢复后门禁

```powershell
git ls-files -- .env.local data/private-output/m2-v2-evidence-pilot
git status --short
npm run check:no-real-data
npm run lint
npm run build
npm test
```

`git ls-files` 必须为空，工作区必须 clean。恢复完成不等于授权继续检索；新的真实 query、full 160、V2-C/V2-D/C4/M3、final holdout 和 release 仍需单独授权。

## 构建命令

构建必须在 clean 且 `HEAD == upstream` 时进行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/m2-v2-evidence-pilot/build_m2_v2_private_state_migration.ps1
```

构建器只输出包、SHA sidecar、脱敏 receipt 和工具副本的路径；不会输出密码。recovery key 写入仓库之外的独立目录，并限制为当前 Windows 用户访问。
