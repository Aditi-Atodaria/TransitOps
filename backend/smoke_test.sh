#!/bin/bash
set -e
BASE=http://127.0.0.1:8000

# Pick a working Python interpreter for JSON parsing (skips broken shims like
# the Windows Store python3 alias). Override with:  PY=/path/to/python ./smoke_test.sh
if [ -z "$PY" ]; then
  for cand in python3 python ../venv/Scripts/python.exe ./venv/Scripts/python.exe; do
    if echo | "$cand" -c "pass" >/dev/null 2>&1; then PY="$cand"; break; fi
  done
fi
: "${PY:?No working Python interpreter found for smoke test}"
echo "Using Python: $PY"

TOKEN=$(curl -s -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"manager@transitops.dev","password":"password123"}' | "$PY" -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "TOKEN OK"

echo "--- vehicles ---"
curl -s $BASE/api/vehicles -H "Authorization: Bearer $TOKEN" | "$PY" -m json.tool

echo "--- drivers ---"
curl -s $BASE/api/drivers -H "Authorization: Bearer $TOKEN" | "$PY" -m json.tool

echo "--- kpis before ---"
curl -s $BASE/api/dashboard/kpis -H "Authorization: Bearer $TOKEN"
echo

echo "--- create trip (Van-05, Rahul Verma, 450kg) ---"
TRIP=$(curl -s -X POST $BASE/api/trips -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"Mumbai","destination":"Pune","vehicle_id":1,"driver_id":1,"cargo_weight_kg":450,"planned_distance_km":150,"revenue":8000}')
echo $TRIP
TRIP_ID=$(echo $TRIP | "$PY" -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "--- try overweight trip (should fail 422) ---"
curl -s -o /dev/null -w "status=%{http_code}\n" -X POST $BASE/api/trips -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"Mumbai","destination":"Pune","vehicle_id":1,"driver_id":1,"cargo_weight_kg":9999,"planned_distance_km":150}'

echo "--- dispatch trip $TRIP_ID ---"
curl -s -X POST $BASE/api/trips/$TRIP_ID/dispatch -H "Authorization: Bearer $TOKEN" | "$PY" -m json.tool

echo "--- vehicle 1 status after dispatch ---"
curl -s $BASE/api/vehicles -H "Authorization: Bearer $TOKEN" | "$PY" -c "import sys,json; d=json.load(sys.stdin); print([v for v in d if v['id']==1])"

echo "--- try dispatching driver 1 again on new trip (should fail, driver on trip) ---"
TRIP2=$(curl -s -X POST $BASE/api/trips -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"Pune","destination":"Nashik","vehicle_id":3,"driver_id":1,"cargo_weight_kg":100,"planned_distance_km":50}')
TRIP2_ID=$(echo $TRIP2 | "$PY" -c "import sys,json; print(json.load(sys.stdin)['id'])")
curl -s -o /dev/null -w "status=%{http_code}\n" -X POST $BASE/api/trips/$TRIP2_ID/dispatch -H "Authorization: Bearer $TOKEN"

echo "--- complete trip $TRIP_ID ---"
curl -s -X POST $BASE/api/trips/$TRIP_ID/complete -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"final_odometer_km":12650,"fuel_consumed_l":15,"fuel_cost":1500}' | "$PY" -m json.tool

echo "--- maintenance create on vehicle 2 ---"
MLOG=$(curl -s -X POST $BASE/api/maintenance -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"vehicle_id":2,"description":"Oil change","cost":2000}')
echo $MLOG
MLOG_ID=$(echo $MLOG | "$PY" -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "--- vehicle 2 status after maintenance open (should be In Shop) ---"
curl -s $BASE/api/vehicles -H "Authorization: Bearer $TOKEN" | "$PY" -c "import sys,json; d=json.load(sys.stdin); print([v for v in d if v['id']==2])"

echo "--- close maintenance $MLOG_ID ---"
curl -s -X POST $BASE/api/maintenance/$MLOG_ID/close -H "Authorization: Bearer $TOKEN" | "$PY" -m json.tool

echo "--- vehicle 2 status after maintenance close (should be Available) ---"
curl -s $BASE/api/vehicles -H "Authorization: Bearer $TOKEN" | "$PY" -c "import sys,json; d=json.load(sys.stdin); print([v for v in d if v['id']==2])"

echo "--- reports summary ---"
curl -s $BASE/api/reports/summary -H "Authorization: Bearer $TOKEN" | "$PY" -m json.tool

echo "--- kpis after ---"
curl -s $BASE/api/dashboard/kpis -H "Authorization: Bearer $TOKEN"
echo

# ============================================================
# Build-out additions (Sections A–D)
# ============================================================

echo "--- A1: kpis with status filter (status=Available) ---"
curl -s "$BASE/api/dashboard/kpis?status=Available" -H "Authorization: Bearer $TOKEN"
echo
echo "--- A1: dashboard facets (type/region/status options) ---"
curl -s $BASE/api/dashboard/facets -H "Authorization: Bearer $TOKEN" | "$PY" -m json.tool

echo "--- A5: pagination — X-Total-Count header + limit ---"
curl -s -D - "$BASE/api/vehicles?limit=2" -H "Authorization: Bearer $TOKEN" -o /dev/null | grep -i "x-total-count"

echo "--- A2: archive vehicle 2 then confirm hidden from default list ---"
curl -s -o /dev/null -w "archive status=%{http_code}\n" -X DELETE $BASE/api/vehicles/2 -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/api/vehicles?limit=0" -H "Authorization: Bearer $TOKEN" | "$PY" -c "import sys,json; d=json.load(sys.stdin); print('vehicle 2 hidden from default:', all(v['id']!=2 for v in d))"
curl -s "$BASE/api/vehicles?limit=0&include_archived=true" -H "Authorization: Bearer $TOKEN" | "$PY" -c "import sys,json; d=json.load(sys.stdin); print('vehicle 2 visible with flag:', any(v['id']==2 for v in d))"
echo "--- A2: restore vehicle 2 ---"
curl -s -o /dev/null -w "restore status=%{http_code}\n" -X POST $BASE/api/vehicles/2/restore -H "Authorization: Bearer $TOKEN"

echo "--- A4: safety incident (Safety Officer) deducts score ---"
SAFETY_TOKEN=$(curl -s -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"safety@transitops.dev","password":"password123"}' | "$PY" -c "import sys,json; print(json.load(sys.stdin)['token'])")
curl -s -X POST $BASE/api/drivers/1/incident -H "Authorization: Bearer $SAFETY_TOKEN" -H "Content-Type: application/json" \
  -d '{"points":5,"reason":"harsh braking"}' | "$PY" -c "import sys,json; d=json.load(sys.stdin); print('new safety score:', d['driver']['safety_score'])"
echo "--- A4: incident log for driver 1 ---"
curl -s $BASE/api/drivers/1/incidents -H "Authorization: Bearer $TOKEN" | "$PY" -m json.tool

echo "--- B/RBAC: financial analyst cannot create a vehicle (expect 403) ---"
FIN_TOKEN=$(curl -s -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"finance@transitops.dev","password":"password123"}' | "$PY" -c "import sys,json; print(json.load(sys.stdin)['token'])")
curl -s -o /dev/null -w "status=%{http_code}\n" -X POST $BASE/api/vehicles -H "Authorization: Bearer $FIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"reg_number":"ZZ-00","name":"x","type":"Van","max_load_kg":100}'

echo "--- D3: compliance alerts (licenses/docs expiring within 30d) ---"
curl -s "$BASE/api/compliance/alerts?within=30" -H "Authorization: Bearer $TOKEN" | "$PY" -c "import sys,json; d=json.load(sys.stdin); print('license_alerts:', len(d['license_alerts']), 'document_alerts:', len(d['document_alerts']))"

echo "--- D4: upload + list + delete a vehicle document ---"
# local file (portable across native curl / git-bash path handling)
printf '%%PDF-1.4 test' > _smoke_doc.pdf
DOC=$(curl -s -X POST $BASE/api/vehicles/1/documents -H "Authorization: Bearer $TOKEN" \
  -F "doc_type=Insurance" -F "expiry_date=2026-08-01" -F "file=@_smoke_doc.pdf;type=application/pdf")
echo $DOC
DOC_ID=$(echo $DOC | "$PY" -c "import sys,json; print(json.load(sys.stdin)['id'])")
curl -s -o /dev/null -w "reject .exe status=%{http_code} (expect 422)\n" -X POST $BASE/api/vehicles/1/documents -H "Authorization: Bearer $TOKEN" \
  -F "doc_type=Other" -F "file=@_smoke_doc.pdf;filename=evil.exe;type=application/octet-stream"
curl -s -o /dev/null -w "download status=%{http_code}\n" $BASE/api/documents/$DOC_ID/download -H "Authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "delete status=%{http_code}\n" -X DELETE $BASE/api/documents/$DOC_ID -H "Authorization: Bearer $TOKEN"
rm -f _smoke_doc.pdf

echo "--- D1: reports summary now includes chart data ---"
curl -s $BASE/api/reports/summary -H "Authorization: Bearer $TOKEN" | "$PY" -c "import sys,json; d=json.load(sys.stdin); print('has cost_breakdown:', 'cost_breakdown' in d, '| has utilization_trend:', 'utilization_trend' in d)"

echo "--- D5: reports print (PDF source) endpoint ---"
curl -s -o /dev/null -w "print status=%{http_code}\n" $BASE/api/reports/print -H "Authorization: Bearer $TOKEN"

echo "ALL SMOKE TESTS RAN"
