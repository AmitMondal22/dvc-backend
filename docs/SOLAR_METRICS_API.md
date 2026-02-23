# Solar Energy Metrics API Documentation

## Overview

The Solar Energy Metrics API calculates key performance indicators for solar photovoltaic (PV) systems based on real-time device data and weather information. This API computes solar irradiance components, Performance Ratio (PR), and Capacity Utilization Factor (CUF) to help monitor and analyze solar plant efficiency.

---

## Table of Contents

1. [API Endpoint](#api-endpoint)
2. [Authentication](#authentication)
3. [Request Parameters](#request-parameters)
4. [Response Format](#response-format)
5. [Calculations](#calculations)
6. [Example Requests](#example-requests)
7. [Response Examples](#response-examples)
8. [Error Handling](#error-handling)
9. [Use Cases](#use-cases)
10. [Formulas Reference](#formulas-reference)

---

## API Endpoint

### Get Solar Energy Metrics

```
GET /api/device/:deviceId/solar-metrics
```

### Base URL

```
http://localhost:5000
```

### HTTP Method

**GET**

### Authentication

**Required:** Bearer Token (JWT)

```
Authorization: Bearer <jwt_token>
```

---

## Authentication

All requests to this endpoint require JWT authentication via Bearer token.

### How to Get JWT Token

1. Call the login endpoint with credentials
2. Extract the JWT token from the response
3. Include it in the Authorization header of all requests

### Example Header

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Request Parameters

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `deviceId` | Integer | Yes | Unique device identifier |

### Query Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `fromDate` | String (YYYY-MM-DD) | Today | - | Start date for data range |
| `toDate` | String (YYYY-MM-DD) | Today | - | End date for data range |
| `tiltAngle` | Float | 18 | 0-90 | Module tilt angle in degrees (β) |
| `diffuseFraction` | Float | 0.2 | 0.15-0.25 | Diffuse fraction coefficient (fd) |
| `albedo` | Float | 0.2 | 0-1 | Ground reflectance coefficient (ρ) |

### Parameter Details

#### Date Range Parameters

- **Format:** `YYYY-MM-DD` (e.g., 2026-02-10)
- **Behavior:** If omitted, defaults to current day
- **Time Range:** 00:00:00 to 23:59:59 UTC
- **Note:** Both dates inclusive

#### Solar Parameters

- **Tilt Angle (β):** Module orientation angle (0° = horizontal, 90° = vertical)
  - Typical Range: 15-40°
  - Default: 18° (optimal for many locations)

- **Diffuse Fraction (fd):** Proportion of diffuse solar radiation
  - Typical Range: 0.15-0.25
  - Lower values: Clear skies
  - Higher values: Cloudy conditions

- **Albedo (ρ):** Ground reflectance coefficient
  - Sand: ~0.35-0.4
  - Grass: ~0.2-0.25 (default)
  - Snow: ~0.8-0.9
  - Asphalt: ~0.1

---

## Response Format

### Success Response (200 OK)

```json
{
  "device": {
    "id": 1,
    "sn": "DEVICE-SN-001",
    "type": "INVERTER"
  },
  "station": {
    "id": 1,
    "name": "Solar Station 1",
    "location": "New Delhi, India",
    "installedCapacity": 10.355,
    "unit": "kWp"
  },
  "period": {
    "from": "2026-02-10",
    "to": "2026-02-12",
    "days": 3,
    "dataPoints": 72
  },
  "aggregatedData": {
    "totalACEnergy": 681.9,
    "averageGHI": 5.268,
    "unit": "kWh, kWh/m²"
  },
  "calculations": {
    "diffuse": 1.027816573,
    "reflected": 0.025783427,
    "beam": 4.2144,
    "totalPOA": 5.268
  },
  "results": {
    "performanceRatio": {
      "value": 72.5937642,
      "unit": "%",
      "description": "Daily Performance Ratio"
    },
    "capacityUtilizationFactor": {
      "value": 17.1,
      "unit": "%",
      "description": "Capacity Utilization Factor"
    }
  },
  "detailedTimeSeries": [
    {
      "timestamp": "2026-02-10T00:00:00.000Z",
      "acEnergy": 25.5,
      "ghi": 4.8,
      "weather": {
        "temp": 28.5,
        "clouds": 15
      }
    }
  ],
  "calculatedAt": "2026-02-12T10:30:45.123Z"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `device` | Object | Device information (ID, serial number, type) |
| `station` | Object | Station information (name, location, capacity) |
| `period` | Object | Analysis period details (dates, days, data points) |
| `aggregatedData` | Object | Summed/averaged metrics for the period |
| `calculations` | Object | Irradiance component calculations |
| `results` | Object | Key performance indicators (PR & CUF) |
| `detailedTimeSeries` | Array | Hour-by-hour or data point by data point breakdown |
| `calculatedAt` | String | Timestamp of calculation |

---

## Calculations

### 1. Solar Irradiance Components

The API calculates plane-of-array (POA) irradiance by decomposing Global Horizontal Irradiance (GHI) into three components:

#### Diffuse Component (Id)
```
Id = GHI × fd × (1 + cos(β)) / 2
```

- **GHI:** Global Horizontal Irradiance from weather data
- **fd:** Diffuse fraction (default: 0.2)
- **β:** Module tilt angle in radians

#### Reflected Component (Ir)
```
Ir = GHI × ρ × (1 - cos(β)) / 2
```

- **ρ:** Ground reflectance (albedo, default: 0.2)

#### Beam Component (Ib)
```
Ib = GHI - (Id + Ir)
```

- Direct normal irradiance component adjusted for tilt

#### Total POA (Plane of Array)
```
POA = Ib + Id + Ir
```

### 2. Performance Ratio (PR)

Performance Ratio measures the overall system efficiency and quality of components.

```
Yr (Reference Yield) = POA / 1 kW/m²
Yf (Final Yield) = Eac / Pdc
PR = (Yf / Yr) × 100 [%]
```

Where:
- **Eac:** AC Energy Export (kWh)
- **Pdc:** Installed DC Capacity (kWp)
- **Yr:** Reference Yield - theoretical energy per unit capacity
- **Yf:** Final Yield - actual useful energy per unit capacity

**Interpretation:**
- **PR > 75%:** Excellent system quality
- **PR 70-75%:** Good system quality
- **PR 65-70%:** Average system quality
- **PR < 60%:** Poor system quality or issues present

### 3. Capacity Utilization Factor (CUF)

CUF represents the average utilization of the plant's installed capacity.

```
CUF = (Total Energy Generated / (Plant Capacity × 24 × Days)) × 100 [%]
```

Where:
- **Total Energy:** Sum of all AC energy over the period (kWh)
- **Plant Capacity:** Installed DC capacity (kWp)
- **Days:** Number of days in analysis period
- **24:** Hours per day

**Interpretation:**
- **CUF 20-25%:** Excellent utilization (optimal conditions)
- **CUF 15-20%:** Good utilization (typical conditions)
- **CUF 10-15%:** Average utilization
- **CUF < 10%:** Poor utilization or system issues

---

## Example Requests

### Request 1: Multi-Day Analysis with Default Parameters

```bash
curl -X GET "http://localhost:5000/api/device/1/solar-metrics?fromDate=2026-02-10&toDate=2026-02-12" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

**cURL Command:**
```bash
curl -X GET \
  'http://localhost:5000/api/device/1/solar-metrics?fromDate=2026-02-10&toDate=2026-02-12' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### Request 2: Today's Metrics (Default)

```bash
curl -X GET "http://localhost:5000/api/device/1/solar-metrics" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Request 3: Custom Solar Parameters

```bash
curl -X GET "http://localhost:5000/api/device/1/solar-metrics?tiltAngle=25&diffuseFraction=0.18&albedo=0.25" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Request 4: Complete Example

```bash
curl -X GET \
  'http://localhost:5000/api/device/1/solar-metrics?fromDate=2026-02-01&toDate=2026-02-12&tiltAngle=20&diffuseFraction=0.22&albedo=0.2' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json'
```

---

## Response Examples

### Example 1: Successful Response

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
    "unit": "kWp"
  },
  "period": {
    "from": "2026-02-10",
    "to": "2026-02-12",
    "days": 3,
    "dataPoints": 72
  },
  "aggregatedData": {
    "totalACEnergy": 681.9,
    "averageGHI": 5.268,
    "unit": "kWh, kWh/m²"
  },
  "calculations": {
    "diffuse": 1.027816573,
    "reflected": 0.025783427,
    "beam": 4.2144,
    "totalPOA": 5.268
  },
  "results": {
    "performanceRatio": {
      "value": 72.5937642,
      "unit": "%",
      "description": "Daily Performance Ratio"
    },
    "capacityUtilizationFactor": {
      "value": 17.1,
      "unit": "%",
      "description": "Capacity Utilization Factor"
    }
  },
  "detailedTimeSeries": [
    {
      "timestamp": "2026-02-10T00:00:00.000Z",
      "acEnergy": 25.5,
      "ghi": 4.8,
      "weather": {
        "temp": 28.5,
        "clouds": 15
      }
    },
    {
      "timestamp": "2026-02-10T01:00:00.000Z",
      "acEnergy": 28.3,
      "ghi": 5.2,
      "weather": {
        "temp": 29.1,
        "clouds": 10
      }
    },
    {
      "timestamp": "2026-02-10T02:00:00.000Z",
      "acEnergy": 32.1,
      "ghi": 5.8,
      "weather": {
        "temp": 29.5,
        "clouds": 5
      }
    }
  ],
  "calculatedAt": "2026-02-12T10:30:45.123Z"
}
```

---

## Error Handling

### Error Response Codes and Messages

#### 404 - Device Not Found

```json
{
  "message": "Device not found"
}
```

**Causes:**
- Invalid device ID
- Device deleted from database
- Device not yet registered

#### 404 - No Device Data Found

```json
{
  "message": "No device data found for the specified period"
}
```

**Causes:**
- Device has no data for the requested date range
- Date range in future or past with no data collection
- Device offline during the period

#### 400 - Missing Station or Capacity Data

```json
{
  "message": "Station or capacity data not found"
}
```

**Causes:**
- Station not linked to device
- Station capacity not configured
- Required device metadata missing

#### 401 - Unauthorized

```json
{
  "message": "No token provided"
}
```

**Causes:**
- Missing Authorization header
- Invalid or expired JWT token
- Incorrect token format

**Fix:** Include valid JWT token in header:
```
Authorization: Bearer <valid_jwt_token>
```

#### 500 - Server Error

```json
{
  "message": "Error message describing the issue"
}
```

**Causes:**
- Database connection errors
- Server-side processing errors
- Invalid parameter values

---

## Use Cases

### Use Case 1: Daily Performance Monitoring

**Objective:** Monitor PR and CUF for a specific solar device daily

**Request:**
```
GET /api/device/1/solar-metrics?fromDate=2026-02-12&toDate=2026-02-12
```

**Response Values to Track:**
- `results.performanceRatio.value` - Daily PR (%)
- `results.capacityUtilizationFactor.value` - Daily CUF (%)

**Action Items:**
- If PR < 70%, investigate system issues
- If CUF < 10%, check weather conditions or device status

### Use Case 2: Monthly Performance Analysis

**Objective:** Analyze system efficiency over a month

**Request:**
```
GET /api/device/1/solar-metrics?fromDate=2026-02-01&toDate=2026-02-28
```

**Analysis:**
- Compare PR trend across dates
- Identify seasonal variations in CUF
- Detect underperforming days

### Use Case 3: System Design Optimization

**Objective:** Test different tilt angles and albedo values

**Requests:**
```
# Test tilt angle 20°
GET /api/device/1/solar-metrics?tiltAngle=20

# Test albedo 0.3 (with reflective surface)
GET /api/device/1/solar-metrics?albedo=0.3

# Test combined parameters
GET /api/device/1/solar-metrics?tiltAngle=25&albedo=0.25&diffuseFraction=0.22
```

**Comparison:**
- Compare PR values across different configurations
- Select configuration with highest PR

### Use Case 4: Weather Impact Analysis

**Objective:** Correlate weather conditions with performance

**Use Data From:**
- `detailedTimeSeries[].weather` - Temperature and cloud coverage
- `aggregatedData.averageGHI` - Average solar radiation

**Analysis:**
- High clouds → Lower GHI → Lower energy
- High temperature → Lower PR (efficiency drops)

---

## Formulas Reference

### Complete Formula List

#### Irradiance Decomposition
```
β = tiltAngle × π/180                                      [radians]
Id = GHI × fd × (1 + cos(β)) / 2                          [Diffuse]
Ir = GHI × ρ × (1 - cos(β)) / 2                           [Reflected]
Ib = GHI - (Id + Ir)                                       [Beam]
POA = Ib + Id + Ir                                         [Total]
```

#### Performance Metrics
```
Yr = POA / 1 kW/m²                                         [Reference Yield]
Yf = Eac / Pdc                                             [Final Yield]
PR = (Yf / Yr) × 100                                       [Performance Ratio]
CUF = (ΣEac / (Pdc × 24 × Days)) × 100                    [Capacity Utilization]
```

#### Variable Definitions
```
GHI  = Global Horizontal Irradiance (kWh/m²)
fd   = Diffuse fraction (0.15-0.25)
ρ    = Ground reflectance/Albedo (0-1)
β    = Module tilt angle (degrees)
Eac  = AC Energy output (kWh)
Pdc  = Plant DC Capacity (kWp)
Days = Analysis period (days)
```

---

## Quick Start Guide

### Step 1: Authentication
```bash
# Login to get JWT token
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

### Step 2: Make API Request
```bash
curl -X GET \
  'http://localhost:5000/api/device/1/solar-metrics?fromDate=2026-02-10&toDate=2026-02-12' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### Step 3: Parse Response
- Extract `results.performanceRatio.value` for PR
- Extract `results.capacityUtilizationFactor.value` for CUF
- Analyze `detailedTimeSeries` for hourly breakdown

---

## Postman Collection

A Postman collection is available with pre-configured requests:
- **File:** `Solar_Energy_Metrics_API.postman_collection.json`
- **Import Steps:**
  1. Open Postman
  2. Click Import
  3. Select the collection file
  4. Update `base_url` and `jwt_token` variables
  5. Start making requests

---

## Support & Troubleshooting

### Common Issues

#### Issue: 401 Unauthorized
**Solution:** Verify JWT token is valid and included in Authorization header

#### Issue: 404 Device Not Found
**Solution:** Check device ID exists in database and is correctly formatted

#### Issue: No Data Found
**Solution:** Verify device had active data collection during requested date range

#### Issue: Negative PR or CUF Values
**Solution:** Check for data quality issues or invalid capacity values

---

## Version Information

- **API Version:** 1.0.0
- **Last Updated:** February 2026
- **Base URL:** `http://localhost:5000`
- **Authentication:** JWT Bearer Token

---

## Contact & Support

For issues or questions:
1. Check error messages and troubleshooting section
2. Verify parameters match documentation
3. Review example requests
4. Contact system administrator

---

**End of Documentation**
