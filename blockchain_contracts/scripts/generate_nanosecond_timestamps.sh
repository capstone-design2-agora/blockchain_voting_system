#!/bin/bash

# 나노초 단위로 시간 계산
NOW_NS=$(date +%s%N)
NOW_S=$(date +%s)

# 1시간 = 3,600초 = 3,600,000,000,000 나노초
HOUR_NS=3600000000000

OPENS_AT_NS=$NOW_NS
CLOSES_AT_NS=$((NOW_NS + HOUR_NS))
ANNOUNCES_AT_NS=$((CLOSES_AT_NS + 180000000000))  # 3분 후

echo "Current time (s): $NOW_S"
echo "Current time (ns): $NOW_NS"
echo ""
echo "Opens at (ns): $OPENS_AT_NS"
echo "Closes at (ns): $CLOSES_AT_NS"
echo "Announces at (ns): $ANNOUNCES_AT_NS"
echo ""
echo "To deploy with nanosecond timestamps:"
echo "export BALLOT_OPENS_AT=$OPENS_AT_NS"
echo "export BALLOT_CLOSES_AT=$CLOSES_AT_NS"
echo "export BALLOT_ANNOUNCES_AT=$ANNOUNCES_AT_NS"
echo ""
echo "Then run:"
echo "node deploy_contract.js"
