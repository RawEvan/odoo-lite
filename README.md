# Odoo Lite

基于 Odoo 17 的轻量级开发环境，包含 OMyFlow 自定义流程模块。

## 快速开始

### 1. 环境要求

- Python 3.10 或 3.11（推荐）
- PostgreSQL
- Node.js 18+（用于 OMyFlow 前端开发）

### 2. 配置

```bash
# 复制配置文件模板
cp odoo.conf.example odoo.conf

# 编辑配置文件
vim odoo.conf
```

### 3. 数据库准备

```bash
# 创建 PostgreSQL 用户
/Applications/Postgres.app/Contents/Versions/latest/bin/psql -d postgres -c "CREATE USER odoo WITH PASSWORD 'odoo' CREATEDB;"
```

### 4. 启动服务

**启动 Odoo 后端：**
```bash
cd /Users/evan/Documents/myprj/odoo-lite
python3 odoo-bin -c odoo.conf
```

**启动 OMyFlow 前端开发服务器：**
```bash
cd /Users/evan/Documents/myprj/odoo-lite/custom_addons/omyflow
npm install
npm run dev
```

### 5. 访问地址

| 服务 | 地址 |
|------|------|
| Odoo 后台 | http://localhost:8070/ |
| OMyFlow 前端 | http://localhost:5175/ |

## 配置文件说明

`odoo.conf` 文件包含敏感信息，不应提交到 Git。请使用 `odoo.conf.example` 作为模板：

```bash
cp odoo.conf.example odoo.conf
```

### 主要配置项

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `admin_passwd` | 数据库管理密码 | admin |
| `db_host` | 数据库主机 | False（本地socket） |
| `db_port` | 数据库端口 | False（默认端口） |
| `db_user` | 数据库用户名 | odoo |
| `db_password` | 数据库密码 | odoo |
| `http_port` | HTTP 服务端口 | 8070 |
| `addons_path` | 模块路径 | addons,odoo/addons,custom_addons |

### 生成加密密码

```bash
python3 -c "from passlib.hash import pbkdf2_sha512; print(pbkdf2_sha512.hash('your_password'))"
```

## OMyFlow 模块

自定义多页面流程管理模块，功能包括：

- 多页面分组管理
- 8种布局模式
- 主题系统（8种颜色）
- Model 页面映射
- 响应式设计

详见：[custom_addons/omyflow/README.md](custom_addons/omyflow/README.md)

## Python 3.12 兼容性

本项目已适配 Python 3.12，修改了以下文件：

- `odoo/tools/mail.py` - 兼容 lxml.html.clean 模块变更
- `odoo/tools/safe_eval.py` - 添加 RETURN_CONST 操作码支持

推荐使用 Python 3.11 以获得最佳兼容性。

---

## 原始 Odoo 说明

Odoo is a suite of web based open source business apps.

The main Odoo Apps include an [Open Source CRM](https://www.odoo.com/page/crm),
[Website Builder](https://www.odoo.com/app/website),
[eCommerce](https://www.odoo.com/app/ecommerce),
[Warehouse Management](https://www.odoo.com/app/inventory),
[Project Management](https://www.odoo.com/app/project),
[Billing &amp; Accounting](https://www.odoo.com/app/accounting),
[Point of Sale](https://www.odoo.com/app/point-of-sale-shop),
[Human Resources](https://www.odoo.com/app/employees),
[Marketing](https://www.odoo.com/app/social-marketing),
[Manufacturing](https://www.odoo.com/app/manufacturing),
[...](https://www.odoo.com/)

For a standard installation please follow the [Setup instructions](https://www.odoo.com/documentation/master/administration/install/install.html)
from the documentation.

To learn the software, we recommend the [Odoo eLearning](https://www.odoo.com/slides),
or [Scale-up, the business game](https://www.odoo.com/page/scale-up-business-game).
Developers can start with [the developer tutorials](https://www.odoo.com/documentation/master/developer/howtos.html).

### Security

If you believe you have found a security issue, check our [Responsible Disclosure page](https://www.odoo.com/security-report)
for details and get in touch with us via email.
