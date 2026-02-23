# Solar Metrics API - Troubleshooting Guide

## Error: "Station or capacity data not found"

### Problem
The API cannot find capacity data for the device/station combination.

### Root Causes
1. **No Station linked to Device** - `device.stationId` is not set or station doesn't exist
2. **Station has no capacity** - All capacity fields are empty/null
3. **Invalid capacity value** - Capacity is 0 or negative

---

## Solution Steps

### Step 1: Diagnose the Problem
First, check device and station configuration:

```bash
GET /api/device/:deviceId/capacity-info
Authorization: Bearer <jwt_token>
```

**Example:**
```bash
curl -X GET "http://localhost:5000/api/device/1/capacity-info" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "status": "ERROR",
  "device": {
    "deviceId": 1,
    "deviceSn": "INV-001-2026",
    "stationId": 1,
    "type": "INVERTER",
    "connectStatus": 1
  },
  "station": {
    "found": true,
    "id": 1,
    "name": "Delhi Solar Farm",
    "locationAddress": "New Delhi, India",
    "capacityFields": {
      "installedCapacity": null,
      "capacity": null,
      "ratedCapacity": null,
      "peakCapacity": null,
      "acCapacity": null
    }
  },
  "resolvedCapacity": {
    "value": "not_found",
    "source": "all_fields_empty ✗",
    "isValid": false,
    "unit": "kWp"
  },
  "troubleshooting": {
    "issue": "No valid capacity found",
    "solutions": [
      "1️⃣ Ensure device.stationId is set: db.devices.updateOne({deviceId:1}, {$set:{stationId:1}})",
      "2️⃣ Ensure Station exists: db.stations.findOne({id:1})",
      "3️⃣ Add capacity to Station: db.stations.updateOne({id:1}, {$set:{installedCapacity:10.355}})",
      "4️⃣ Or pass capacity as query param in metrics API: ?capacity=10.355"
    ]
  }
}
```

---

### Step 2: Fix Based on Diagnosis

#### **Option A: Add Capacity to Station Database (Recommended)**

```javascript
// Using MongoDB shell
db.stations.updateOne(
  { id: 1 },
  { $set: { installedCapacity: 10.355 } }
)

// OR using Node.js
const Station = require('./src/models/Station');
await Station.updateOne(
  { id: 1 },
  { $set: { installedCapacity: 10.355 } }
);
```

**Check if it worked:**
```bash
GET /api/device/1/capacity-info
```

Response should show:
```json
{
  "status": "OK",
  "resolvedCapacity": {
    "value": 10.355,
    "source": "installedCapacity ✓",
    "isValid": true
  }
}
```

---

#### **Option B: Link Device to Station**

If device is not linked to station:

```javascript
db.devices.updateOne(
  { deviceId: 1 },
  { $set: { stationId: 1 } }
)
```

---

#### **Option C: Pass Capacity as Query Parameter (Quick Fix)**

If you don't want to update the database, pass capacity directly:

```bash
GET /api/device/1/solar-metrics?capacity=10.355&fromDate=2026-02-10&toDate=2026-02-12
Authorization: Bearer <jwt_token>
```

Response will include:
```json
{
  "station": {
    "installedCapacity": 10.355,
    "capacitySource": "manual_param",
    "unit": "kWp",
    "warning": "Station details not found, only capacity available"
  }
}
```

---

### Step 3: Call Solar Metrics API

Once capacity is resolved:

```bash
GET /api/device/1/solar-metrics?fromDate=2026-02-10&toDate=2026-02-12
Authorization: Bearer <jwt_token>
```

**Success Response:**
```json
{
  "device": {
    "id": 1,
    "sn": "INV-001-2026",
    "type": "INVERTER"
  },
  "station": {
    "id": 1,
    "name": "Delhi Solar Farm",
    "location": "New Delhi, India",
    "installedCapacity": 10.355,
    "capacitySource": "station.installedCapacity",
    "unit": "kWp"
  },
  "results": {
    "performanceRatio": {
      "value": 72.59,
      "unit": "%"
    },
    "capacityUtilizationFactor": {
      "value": 17.1,
      "unit": "%"
    }
  }
}
```

---

## Complete Setup Example

### 1. Create Station with Capacity

```javascript
// MongoDB
db.stations.insertOne({
  id: 1,
  name: "Solar Farm Delhi",
  locationAddress: "New Delhi, India",
  installedCapacity: 10.355,  // ⭐ KEY FIELD
  regionTimezone: "IST",
  locationLat: 28.7041,
  locationLng: 77.1025
})
```

### 2. Link Device to Station

```javascript
db.devices.insertOne({
  deviceId: 1,
  deviceSn: "INV-001-2026",
  stationId: 1,  // ⭐ Links to Station
  deviceType: "INVERTER",
  connectStatus: 1
})
```

### 3. Test API

```bash
curl -X GET \
  'http://localhost:5000/api/device/1/solar-metrics?fromDate=2026-02-10&toDate=2026-02-12' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' | jq
```

---

## Capacity Field Priority

The API tries to resolve capacity in this order:

1. **Query Parameter** - `?capacity=10.355` (highest priority)
2. **station.installedCapacity** - Primary field ⭐
3. **station.capacity** - Alternate field
4. **station.ratedCapacity** - Rated capacity
5. **station.peakCapacity** - Peak capacity
6. **station.acCapacity** - AC side capacity

---

## API Endpoints

### Get Solar Metrics (with Optional Capacity Override)

```
GET /api/device/:deviceId/solar-metrics
```

**Query Parameters:**
- `capacity` - Optional capacity in kWp (overrides station data)
- `fromDate` - Start date YYYY-MM-DD
- `toDate` - End date YYYY-MM-DD
- `tiltAngle` - Module tilt angle (default: 18)
- `diffuseFraction` - Diffuse fraction (default: 0.2)
- `albedo` - Ground reflectance (default: 0.2)

**Example with Capacity Override:**
```bash
GET /api/device/1/solar-metrics?capacity=10.355&fromDate=2026-02-10&toDate=2026-02-12
```

---

### Diagnose Capacity Issue

```
GET /api/device/:deviceId/capacity-info
```

Returns:
- Device info
- Station info
- All capacity field values
- Which field is being used
- Troubleshooting steps

---

## Common Scenarios

### Scenario 1: Station Exists but Has No Capacity

**Diagnosis:**
```bash
GET /api/device/1/capacity-info
```

**Shows:**
```json
{
  "status": "ERROR",
  "station": {
    "found": true,
    "capacityFields": {
      "installedCapacity": null,
      "capacity": null
    }
  }
}
```

**Fix:**
```javascript
db.stations.updateOne({id:1}, {$set:{installedCapacity:10.355}})
```

---

### Scenario 2: Device Not Linked to Station

**Diagnosis:**
```bash
GET /api/device/1/capacity-info
```

**Shows:**
```json
{
  "device": {
    "stationId": "not_set"
  },
  "station": {
    "found": false
  }
}
```

**Fix:**
```javascript
db.devices.updateOne({deviceId:1}, {$set:{stationId:1}})
```

---

### Scenario 3: Multiple Capacity Fields (Choose One)

**Diagnosis shows multiple values:**
```json
{
  "capacityFields": {
    "installedCapacity": 10.355,
    "capacity": 10.0,
    "ratedCapacity": 11.0
  }
}
```

**API will use:** `installedCapacity` (first priority)

If you want different value:
- Update only the `installedCapacity` field
- Or use query param: `?capacity=11.0`

---

## Quick Reference

| Issue | Solution |
|-------|----------|
| Station not found | Set `device.stationId` correctly |
| Capacity is null | Add `installedCapacity` to Station |
| Capacity is 0 | Update with positive value |
| Need override | Use `?capacity=10.355` query param |
| Multiple capacities | API uses `installedCapacity` first |

---

## Testing with curl

```bash
# 1. Check capacity status
curl -X GET http://localhost:5000/api/device/1/capacity-info \
  -H "Authorization: Bearer TOKEN"

# 2. Try metrics API with manual capacity
curl -X GET "http://localhost:5000/api/device/1/solar-metrics?capacity=10.355" \
  -H "Authorization: Bearer TOKEN"

# 3. Try metrics API with database capacity
curl -X GET "http://localhost:5000/api/device/1/solar-metrics?fromDate=2026-02-10" \
  -H "Authorization: Bearer TOKEN"
```

---

## Postman Collection Updates

Add new request to check capacity:

```
GET {{base_url}}/api/device/1/capacity-info
Authorization: Bearer {{jwt_token}}
```

---

## Still Getting Error?

1. Run diagnostic: `GET /api/device/:deviceId/capacity-info`
2. Follow suggestions in response
3. Verify MongoDB has updated data: `db.stations.findOne({id:1})`
4. Check device-station link: `db.devices.findOne({deviceId:1})`
5. Retry API request

**If still stuck:**
- Check server logs for error details
- Verify JWT token is valid
- Ensure database connection is working
