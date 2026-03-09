#!/bin/bash

# 启动 Odoo 服务器
echo "Starting Odoo server..."
cd /Users/evan/Documents/myprj/odoo-lite && python3 odoo-bin -c odoo.conf &

# 启动前端开发服务器
echo "Starting Vite dev server..."
cd /Users/evan/Documents/myprj/odoo-lite/custom_addons/omyflow && npm run dev &

echo "Servers started!"
echo "- Odoo: http://localhost:8070/"
echo "- OMyFlow: http://localhost:5175/"
