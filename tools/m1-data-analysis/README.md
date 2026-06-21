# M1 真实账单分析工具

本目录只包含独立、只读的数据分析脚本，不属于应用代码。

## 运行

```powershell
$python = 'python'
$env:PYTHONPATH = '<repo>/.analysis-python'
& $python tools/m1-data-analysis/analyze_real_bills.py
```

输入目录固定为 `data/real-bills/`。脚本不会修改、重命名或移动输入文件，并在运行前后核对 SHA-256、文件大小和修改时间。

可进入 Git 的聚合报告写入 `docs/analysis/m1-real-bills/`。包含作品名、渠道名、原始 ID 和行级金额的运营确认样本写入 `data/m1-real-bills-private/`；该目录已被仓库根目录 `.gitignore` 排除。
