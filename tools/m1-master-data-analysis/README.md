# M1 数字版权台账分析工具

本目录只包含 M1 真实数据分析脚本，不包含应用代码、数据库迁移、接口或页面。

## 输入

- `data/real-bills/`：真实账单，只读。
- `data/master-data/`：数字版权台账，只读。
- `docs/analysis/m1-real-bills/summary.json`：上一轮账单分析聚合结果。

## 输出

- `docs/analysis/m1-master-data/`：可提交的聚合报告，不包含作品级明细、作者、版权日期或敏感样本。
- `data/m1-master-data-private/`：被 `.gitignore` 排除的本地运营确认包和敏感样本。

## 运行

```powershell
$env:PYTHONPATH="<repo>/.analysis-python;$env:PYTHONPATH"
python tools\m1-master-data-analysis\analyze_master_data.py
node tools\m1-master-data-analysis\build_ops_confirmation_workbook.mjs
python tools\m1-master-data-analysis\validate_master_data_analysis.py
```
