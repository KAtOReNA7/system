# 本地开发工具链建议

建议安装：

- GitHub CLI `gh`，用于查看 PR、检查 CI 和处理评审反馈。
- Docker Desktop 或 Podman Desktop，用于本地隔离容器环境。
- WSL2 + Ubuntu，用于获得稳定的 Linux 开发与脚本运行环境。
- PostgreSQL 16 client tools，用于本地连接、`psql` 检查和迁移验证。
- Flyway CLI 10.21+，用于本地迁移候选验证和版本检查。
- Node.js 24 / npm 11+，用于运行项目脚本、测试和 CI 对齐验证。

特别说明：

- Docker/Podman/WSL 是为 `mapping_version` 本地隔离演练准备。
- 不得使用正式库。
- 不得把本地密码提交入仓库。
- PostgreSQL 本地系统服务无密码时，不得猜测密码；应重置本地服务配置或改用隔离容器。
