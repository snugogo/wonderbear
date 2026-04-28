#!/bin/bash
# 删除 /tmp/dingtalk-images 下超过 24 小时的文件
find /tmp/dingtalk-images -type f -mmin +1440 -delete 2>/dev/null
# 顺便清理空目录
find /tmp/dingtalk-images -type d -empty -delete 2>/dev/null
