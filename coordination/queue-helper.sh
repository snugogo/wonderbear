#!/usr/bin/env bash
# /opt/wonderbear/coordination/queue-helper.sh
#
# queue.json 增删改查 — 给其他脚本和 bot 调用
#
# 用法:
#   queue-helper.sh list                          → 显示当前 queue
#   queue-helper.sh next                          → 输出下一个 pending(无依赖阻塞的) wo_id
#   queue-helper.sh set-status <wo_id> <status>   → 设置某工单状态
#   queue-helper.sh set-current <wo_id>           → 设当前正在跑的工单
#   queue-helper.sh add <wo_id> <priority> <desc> → 加新工单
#   queue-helper.sh promote <wo_id>               → 从 queue 挪到 history (approved)
#   queue-helper.sh get-status <wo_id>            → 输出某工单的 status

set -uo pipefail
QUEUE_FILE="/opt/wonderbear/coordination/queue.json"
SUB="${1:-list}"

# 确保 queue.json 存在
if [ ! -f "$QUEUE_FILE" ]; then
  echo '{"queue":[],"current":null,"history":[]}' > "$QUEUE_FILE"
fi

case "$SUB" in
  list)
    cat "$QUEUE_FILE" | python3 -m json.tool 2>/dev/null || cat "$QUEUE_FILE"
    ;;

  next)
    python3 << PYEOF
import json
with open('$QUEUE_FILE') as f: d = json.load(f)
done_ids = {h.get('wo_id') for h in d.get('history', [])
            if h.get('status') in ('approved', 'rolled_back', 'skipped')}
for q in sorted(d.get('queue', []), key=lambda x: x.get('priority', 99)):
    if q.get('status') != 'pending': continue
    blocked = q.get('blocked_by', [])
    if all(b in done_ids for b in blocked):
        print(q['wo_id'])
        break
PYEOF
    ;;

  set-status)
    WO_ID="${2:?需 wo_id}"
    STATUS="${3:?需 status}"
    python3 << PYEOF
import json
with open('$QUEUE_FILE') as f: d = json.load(f)
for q in d.get('queue', []):
    if q['wo_id'] == '$WO_ID':
        q['status'] = '$STATUS'
        if '$STATUS' == 'awaiting_approval':
            from datetime import datetime
            q['deployed_at'] = datetime.now().isoformat()
with open('$QUEUE_FILE', 'w') as f: json.dump(d, f, indent=2, ensure_ascii=False)
print('OK')
PYEOF
    ;;

  set-current)
    WO_ID="${2:-null}"
    python3 << PYEOF
import json
with open('$QUEUE_FILE') as f: d = json.load(f)
d['current'] = '$WO_ID' if '$WO_ID' != 'null' else None
with open('$QUEUE_FILE', 'w') as f: json.dump(d, f, indent=2, ensure_ascii=False)
print('OK')
PYEOF
    ;;

  add)
    WO_ID="${2:?需 wo_id}"
    PRIORITY="${3:-10}"
    DESC="${4:-}"
    python3 << PYEOF
import json
with open('$QUEUE_FILE') as f: d = json.load(f)
d['queue'].append({
    'wo_id': '$WO_ID', 'status': 'pending',
    'priority': int('$PRIORITY'), 'blocked_by': [],
    'description': '$DESC',
})
d['queue'].sort(key=lambda x: x.get('priority', 99))
with open('$QUEUE_FILE', 'w') as f: json.dump(d, f, indent=2, ensure_ascii=False)
print('OK: added $WO_ID priority=$PRIORITY')
PYEOF
    ;;

  promote)
    WO_ID="${2:?需 wo_id}"
    python3 << PYEOF
import json
from datetime import datetime
with open('$QUEUE_FILE') as f: d = json.load(f)
new_queue = []
for q in d.get('queue', []):
    if q['wo_id'] == '$WO_ID':
        q['status'] = 'approved'
        q['approved_at'] = datetime.now().isoformat()
        d.setdefault('history', []).append(q)
    else:
        new_queue.append(q)
d['queue'] = new_queue
if d.get('current') == '$WO_ID':
    d['current'] = None
with open('$QUEUE_FILE', 'w') as f: json.dump(d, f, indent=2, ensure_ascii=False)
print('OK: promoted $WO_ID to history')
PYEOF
    ;;

  get-status)
    WO_ID="${2:?需 wo_id}"
    python3 << PYEOF
import json
with open('$QUEUE_FILE') as f: d = json.load(f)
for q in d.get('queue', []):
    if q['wo_id'] == '$WO_ID':
        print(q.get('status', 'unknown'))
        exit(0)
for q in d.get('history', []):
    if q['wo_id'] == '$WO_ID':
        print(q.get('status', 'unknown'))
        exit(0)
print('not_found')
PYEOF
    ;;

  *)
    echo "未知子命令: $SUB"
    echo "可用: list / next / set-status / set-current / add / promote / get-status"
    exit 1
    ;;
esac
