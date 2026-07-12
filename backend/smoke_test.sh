#!/bin/bash
set -e
BASE=http://127.0.0.1:8000

TOKEN=$(curl -s -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"manager@transitops.dev","password":"password123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "TOKEN OK"

echo "--- vehicles ---"
curl -s $BASE/api/vehicles -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo "--- drivers ---"
curl -s $BASE/api/drivers -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo "--- kpis before ---"
curl -s $BASE/api/dashboard/kpis -H "Authorization: Bearer $TOKEN"
echo

echo "--- create trip (Van-05, Rahul Verma, 450kg) ---"
TRIP=$(curl -s -X POST $BASE/api/trips -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"Mumbai","destination":"Pune","vehicle_id":1,"driver_id":1,"cargo_weight_kg":450,"planned_distance_km":150,"revenue":8000}')
echo $TRIP
TRIP_ID=$(echo $TRIP | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "--- try overweight trip (should fail 422) ---"
curl -s -o /dev/null -w "status=%{http_code}\n" -X POST $BASE/api/trips -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"Mumbai","destination":"Pune","vehicle_id":1,"driver_id":1,"cargo_weight_kg":9999,"planned_distance_km":150}'

echo "--- dispatch trip $TRIP_ID ---"
curl -s -X POST $BASE/api/trips/$TRIP_ID/dispatch -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo "--- vehicle 1 status after dispatch ---"
curl -s $BASE/api/vehicles -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print([v for v in d if v['id']==1])"

echo "--- try dispatching driver 1 again on new trip (should fail, driver on trip) ---"
TRIP2=$(curl -s -X POST $BASE/api/trips -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"Pune","destination":"Nashik","vehicle_id":3,"driver_id":1,"cargo_weight_kg":100,"planned_distance_km":50}')
TRIP2_ID=$(echo $TRIP2 | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
curl -s -o /dev/null -w "status=%{http_code}\n" -X POST $BASE/api/trips/$TRIP2_ID/dispatch -H "Authorization: Bearer $TOKEN"

echo "--- complete trip $TRIP_ID ---"
curl -s -X POST $BASE/api/trips/$TRIP_ID/complete -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"final_odometer_km":12650,"fuel_consumed_l":15,"fuel_cost":1500}' | python3 -m json.tool

echo "--- maintenance create on vehicle 2 ---"
MLOG=$(curl -s -X POST $BASE/api/maintenance -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"vehicle_id":2,"description":"Oil change","cost":2000}')
echo $MLOG
MLOG_ID=$(echo $MLOG | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "--- vehicle 2 status after maintenance open (should be In Shop) ---"
curl -s $BASE/api/vehicles -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print([v for v in d if v['id']==2])"

echo "--- close maintenance $MLOG_ID ---"
curl -s -X POST $BASE/api/maintenance/$MLOG_ID/close -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo "--- vehicle 2 status after maintenance close (should be Available) ---"
curl -s $BASE/api/vehicles -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print([v for v in d if v['id']==2])"

echo "--- reports summary ---"
curl -s $BASE/api/reports/summary -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo "--- kpis after ---"
curl -s $BASE/api/dashboard/kpis -H "Authorization: Bearer $TOKEN"
echo
echo "ALL SMOKE TESTS RAN"
